const { Server } = require("socket.io");

const redis = require("redis");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./models/User");
const axios = require("axios");

dotenv.config();

mongoose.connect(process.env.MONGO_URL).then(
  () => {
    console.log("Connected to MongoDB");
  },
  (err) => {
    console.log(err);
  }
);

const client = redis.createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

client.connect().then(
  () => {
    console.log("connected to redis");
  },
  (err) => {
    console.log(err);
  }
);

client.on("error", (error) => {
  console.log(`Error is ${error}`);
});

const io = new Server(8080, {
  cors: {
    origin: process.env.ORIGIN,
  },
});

let onlineUsers = new Map();

async function addUser(userId, socketId) {
  //onlineUsers.set(userId, socketId);
  console.log(`I've added the user ${userId}`);
  await client.set(userId, socketId);
  io.emit("getUser", userId);
}

async function removeUser(userId) {
  //onlineUsers.delete(userId);
  await client.del(userId);
  console.log("user removed!");
}

async function getUser(userId) {
  if (!userId) return false;

  try {
    return await client.get(userId);
  } catch (error) {
    console.log(error);
  }
}

async function sendUserKeys(socket) {
  console.log("sending the whole object");
  const keys = await client.keys("*");
  io.to(socket.id).emit("getUsers", keys);
}

async function sendMessage(receiverId, message) {
  const socketId = await getUser(receiverId);

  if (socketId) {
    io.to(socketId).emit("getMessageNotification", message);
    io.to(socketId).emit("getMessage", message);
  } else {
    try {
      await axios.patch(process.env.UPDATE_NOTIFICATIONS + receiverId, {
        message,
      });
    } catch (error) {
      console.log(error);
    }
  }
}

async function sendLike(likeObject) {
  const { likedUser } = likeObject;
  const socketId = await getUser(likedUser);

  if (socketId) {
    io.to(socketId).emit("getLikeNotification", likeObject);
  }
}

async function sendFollow(followObject) {
  const { followedUser } = followObject;

  const socketId = await getUser(followedUser._id);

  if (socketId) {
    console.log("sentFollowNotification");
    io.to(socketId).emit("getFollowNotification", followObject);
  }
}

async function sendTags(tagObjects) {
  tagObjects.forEach(async (object) => {
    const { likedUser } = object;
    const socketId = await getUser(likedUser);

    if (socketId) {
      io.to(socketId).emit("getLikeNotification", object);
    }
  });
}

async function sendComment(commentObject) {
  const { likedUser } = commentObject;
  const socketId = await getUser(likedUser);

  if (socketId) {
    io.to(socketId).emit("getCommentNotification", commentObject);
  }
}

async function sendBlockNotification(userId, blockObject) {
  const socketId = await getUser(userId);

  if (socketId) {
    io.to(socketId).emit("getBlockNotification", blockObject);
  }
}

io.on("connection", (socket) => {
  console.log(`a user connected ${socket.handshake.query["userId"]}`);

  sendUserKeys(socket);

  socket.on("getUserId", (userId) => {
    if (userId) {
      addUser(userId, socket.id);
    } else {
      console.log("id is null");
    }
  });

  socket.on("sendBlockNotification", (userId, blockObject) => {
    sendBlockNotification(userId, blockObject);
  });

  socket.on("sendFollow", (followObject) => {
    sendFollow(followObject);
  });

  socket.on("sendMessage", (receiverId, message) => {
    sendMessage(receiverId, message);
  });

  socket.on("sendLike", (likeObject) => {
    sendLike(likeObject);
  });

  socket.on("sendTags", (tagObjects) => {
    sendTags(tagObjects);
  });

  socket.on("sendComment", (commentObject) => {
    sendComment(commentObject);
  });

  socket.on("manualDisconnect", () => {
    console.log(`manual disconnect from ${socket.handshake.query["userId"]}`);
    removeUser(socket.handshake.query["userId"]);
    io.emit("removeUser", socket.handshake.query["userId"]);
  });

  socket.on("disconnect", () => {
    console.log(`a user disconnected ${socket.handshake.query["userId"]}`);
    removeUser(socket.handshake.query["userId"]);
    io.emit("removeUser", socket.handshake.query["userId"]);
  });
});

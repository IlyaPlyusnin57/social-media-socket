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
  //return onlineUsers.get(userId);
  return await client.get(userId);
}

async function sendUserKeys(socket) {
  console.log("sending the whole object");
  const keys = await client.keys("*");
  io.to(socket.id).emit("getUsers", keys);
}

async function sendMessage(receiverId, message) {
  const socketId = await getUser(receiverId);
  const user = await User.findById(message.senderId).lean();

  if (socketId) {
    message.senderName = user.first_name + " " + user.last_name;

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

async function sendFollow(followObject) {
  const { followedUser } = followObject;

  const socketId = await getUser(followedUser._id);

  if (socketId) {
    console.log("sentFollowNotification");
    io.to(socketId).emit("getFollowNotification", followObject);
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

  socket.on("sendFollow", (followObject) => {
    sendFollow(followObject);
  });

  socket.on("sendMessage", (receiverId, message) => {
    sendMessage(receiverId, message);
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

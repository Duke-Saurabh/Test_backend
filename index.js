import express from "express";
import cors from "cors";
import path from "path";
import url, { fileURLToPath } from "url";
import dotenv from "dotenv";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./Models/chat.js";
import UserChats from "./Models/userChats.js";
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";

// Load environment variables from .env file
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: 'http://localhost:5173', // Adjust the origin as needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'], // Allow all methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Adjust headers as needed
  credentials: true, // Include if you want to send cookies or other credentials
}));

// export default (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173'); // Allow requests from your frontend
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS'); // Allow these HTTP methods
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Allow these headers
//   res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow credentials like cookies

//   if (req.method === 'OPTIONS') {
//     return res.status(200).end(); // Handle preflight request
//   }

//   // Your API logic here, for example:
//   res.json({ message: 'Hello from the backend!' });
// };

// app.use(express.json());

// const connect = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO);
//     console.log("Connected to MongoDB");
//   } catch (err) {
//     console.log(err);
//   }
// };

// Ensure environment variables are loaded correctly
console.log("IMAGE_KIT_ENDPOINT:", process.env.IMAGE_KIT_ENDPOINT);
console.log("IMAGE_KIT_PUBLIC_KEY:", process.env.IMAGE_KIT_PUBLIC_KEY);
console.log("IMAGE_KIT_PRIVATE_KEY:", process.env.IMAGE_KIT_PRIVATE_KEY);

if (!process.env.IMAGE_KIT_ENDPOINT || !process.env.IMAGE_KIT_PUBLIC_KEY || !process.env.IMAGE_KIT_PRIVATE_KEY) {
  throw new Error('Missing ImageKit configuration');
}

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});
app.get("/",(req,res)=>{
  res.send('Hello');
});
app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    // CREATE A NEW CHAT
    const newChat = new Chat({
      userId: userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    // CHECK IF THE USERCHATS EXISTS
    const userChats = await UserChats.find({ userId: userId });

    // IF DOESN'T EXIST CREATE A NEW ONE AND ADD THE CHAT IN THE CHATS ARRAY
    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [
          {
            _id: savedChat._id,
            title: text.substring(0, 40),
          },
        ],
      });

      await newUserChats.save();
    } else {
      // IF EXISTS, PUSH THE CHAT TO THE EXISTING ARRAY
      await UserChats.updateOne(
        { userId: userId },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
            },
          },
        }
      );

      res.status(201).send(newChat._id);
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating chat!");
  }
});

app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const userChats = await UserChats.find({ userId });

    res.status(200).send(userChats[0].chats);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching userchats!");
  }
});

app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });

    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      {
        $push: {
          history: {
            $each: newItems,
          },
        },
      }
    );
    res.status(200).send(updatedChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding conversation!");
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(401).send("Unauthenticated!");
});

// PRODUCTION
app.use(express.static(path.join(__dirname, "../client")));

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "../client", "index.html"));
// });

app.listen(port, () => {
  connect();
  console.log(`Server running on port ${port}`);
});

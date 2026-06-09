const express = require('express');
const cors = require('cors');
const path = require('path');
const oracledb = require('oracledb');

// router
const sampleRouter = require("./routes/user");
const userRouter = require("./routes/user");
const postsRouter = require("./routes/posts");
const notificationRouter = require("./routes/notifications");

const db = require("./db");

const app = express();
// app.use((req, res, next) => {
//     console.log(`[LOG] ${req.method} ${req.url}`);
//     next();
// });
app.use(cors());
app.use(express.json())

// ejs 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '.')); // .은 경로
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use("/sample", sampleRouter);
app.use("/user", userRouter); // http://localhost:3010/user/...
app.use("/api/posts", postsRouter);
app.use('/api/notifications', notificationRouter);

async function startServer() {
  try {
    await db.init();
    console.log('Successfully connected to Oracle database');

    app.listen(3010, () => {
      console.log('Server is running on port 3010');
    });

  } catch (err) {
    console.error('Error connecting to Oracle database. Server not started.', err);
    process.exit(1); // DB 연결 실패 시 프로세스 종료 (선택 사항)
  }
}

startServer();




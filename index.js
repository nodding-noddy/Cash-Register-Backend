const express = require('express');
const app = express();
const http = require('http').Server(app);
const PORT = 8080;
const jwt = require('jsonwebtoken');
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
});
const path = require('path');
const userIds = [];
const formidable = require('formidable');
const fs = require('fs');
const mysql = require('mysql');

let restroSocket;
let userSocketPool = {};
let lastOrderNumber = 99;

const connection = mysql.createConnection({
  host:'localhost',
  user:'',
  password:'',
  database:'cash_register'
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, resp, next) => {
  resp.header('Access-Control-Allow-Origin','*');
  resp.header('Access-Control-Allow-Methods','POST, GET');
  resp.header('Access-Control-Allow-Headers','Content-Type');
  next();
})

app.get('/',(req, resp) => {
  resp.send(`<h1>Hello ${req.query.name} ${req.query.last_name}</h1>`);
});

io.use((socket, next) => {
  let socketHandshake = socket.handshake.query;
  if(socketHandshake && socketHandshake.token) {
    jwt.verify(socketHandshake.token, ACCESS_TOKEN_SECRET, (err, decoded) => {
      if(err) return next(new Error('Authentication error'));
      userIds.push(decoded);
      next();
    });
  }
  else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
    console.log('A new connection has been established')
    socket.on('restro connection', () => {
      console.log('Restaurant connected');
      restroSocket = socket;
  });

  socket.on('new order placed', (orderDetails) => {
    if(restroSocket) {
      socket.emit('ack', orderDetails);
      lastOrderNumber = lastOrderNumber + 1;
      orderDetails.orderNumber = lastOrderNumber;
      orderDetails.orderStatus = 'pending';
      orderDetails.orderTime = new Date().toLocaleTimeString();
      userSocketPool[lastOrderNumber] = {
        customerName: orderDetails.customerName,
        phoneNo:orderDetails.phoneNo,
        items:orderDetails.items,
        socket: socket,
      }
      restroSocket.emit('new order', orderDetails);
    }else {
      socket.emit('restro offline');
    }
  });

  socket.on('order confirmation', async (orderNumber, isConfirmed) => {
    console.log('Order confirmed for orderNumber',orderNumber);
    await userSocketPool[orderNumber].socket.emit('client order confirmation',isConfirmed);
    if(!isConfirmed) {
      delete userSocketPool[orderNumber];
    }
  })

  socket.on('collect order', (orderNumber) => {
    userSocketPool[orderNumber].socket.emit('collect order');
  })
});

app.post('/upload-menu-item', (req, resp) => {

  const form = formidable({ multiples:true });

  form.parse(req, (err, formFields, files) => {
    if(err) {
      next(err)
      return;
    }

    const userId = formFields.userId;
    connection.query(`INSERT INTO restaurant_data (restro_id, item_name, item_punchline, amount) VALUES(
      ${formFields.userId},'${formFields.itemTitle}', '${formFields.itemDescription}','${formFields.itemAmount}'
    )`, (err, insertResult) => {
      if(err) console.log(err);
      else {
        const newItemId = insertResult.insertId;
        const oldPath = files.itemImage.path;
        const fileName = files.itemImage.name;
        const newPath = path.join(__dirname,'public/uploads/'+ userId +'/'+newItemId+
        fileName.slice(fileName.indexOf('.')));
        const rawData = fs.readFileSync(oldPath);
        fs.writeFile(newPath, rawData, (err) => {
          if(err) console.log('Error writing file',err);
          else
          console.log('File Written successfully');
        });

        resp.json({
          success:true
        });
      }
    });
  });
});

app.get('/images', (req, resp) => {
  const itemId = req.query.item_id;
  const userId = req.query.user_id;
  resp.sendFile(path.join(__dirname, `public/uploads/${userId}/${itemId}.jpg`));
});

http.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Database connection closed successfully!');
  connection.end();
  process.exit();
});


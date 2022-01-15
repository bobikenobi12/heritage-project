import express from "express";
import path from "path";
import ejs from "ejs";
import multer from "multer";
const upload = multer({ dest: "public/uploads" });
import { Pool, Client } from "pg";
import { fileURLToPath } from "url";
import { resolveMx } from "dns";
import bcrypt from "bcrypt";
import session from "express-session";
import flash from "express-flash";
import passport from "passport";
import initializePassport from "./passportConfig";
import * as fs from "fs";
const { Server } = require("socket.io");
const http = require("http");
import formatMessage from "../public/js/messages";
import {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} from "../public/js/chat-users";
import { nextTick } from "process";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

initializePassport(passport);

const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "20070712",
  database: "Heritage",
  port: 5432,
  max: 20,
});

const ROOT_DIR = path.join(__dirname, "..");
const botName = "Dog Bot";
const PORT = process.env.PORT || 5000;

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use("/css", express.static(path.join(ROOT_DIR, "/public/css")));
app.use("/images", express.static(path.join(ROOT_DIR, "/public/images")));
app.use("/js", express.static(path.join(ROOT_DIR, "/public/js")));
app.use("/uploads", express.static(path.join(ROOT_DIR, "/public/uploads")));

let id, name, email;
app.get("/users/sign-up", checkAuthenticated, (req, res) => {
  res.render("pages/sign-up");
});
app.post("/users/sign-up", async (req: any, res) => {
  const { name, email, password, password2 } = req.body;
  let errors = [];

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please enter all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password should be at least 6 characters" });
  }

  if (password != password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    res.render("pages/sign-up", { errors });
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);

    pool
      .query(`SELECT * FROM users WHERE email = $1`, [email])
      .then((results) => {
        if (results.rows.length > 0) {
          errors.push({ message: "Email already registered" });
          res.render("pages/sign-up", { errors });
        } else {
          pool
            .query(
              `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id password`,
              [name, email, hashedPassword]
            )
            .then((results) => {
              req.flash(
                "success_msg",
                "You are now registered. Please sign in"
              );
              res.redirect("/users/sign-in");
            })
            .catch((err) => {
              throw err;
            });
        }
      })
      .catch((err) => {
        throw err;
      });
  }
});
app.get("/users/sign-in", checkAuthenticated, (req, res) => {
  res.render("pages/sign-in");
});
app.post(
  "/users/sign-in",
  passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/users/sign-in",
    failureFlash: true,
  })
);
app.get("/users/dashboard", checkNotAuthenticated, (req: any, res) => {
  id = req.user.id;
  name = req.user.name;
  email = req.user.email;
  res.render("pages/dashboard", { user: req.user.name });
});
app.get("/users/sign-out", (req: any, res) => {
  req.logOut();
  req.flash("success_msg", "You have been signed out.");
  res.redirect("/users/sign-in");
});

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ username, room }) => {
    const user = userJoin(socket.id, username, room);

    socket.join(user.room);

    socket.emit("message", formatMessage(botName, "Welcome to ChatCord!"));

    socket.broadcast
      .to(user.room)
      .emit(
        "message",
        formatMessage(botName, `${user.username} has joined the chat`)
      );

    io.to(user.room).emit("roomUsers", {
      room: user.room,
      users: getRoomUsers(user.room),
    });
  });

  socket.on("chatMessage", (msg) => {
    const user = getCurrentUser(socket.id);

    io.to(user.room).emit("message", formatMessage(user.username, msg));
  });

  socket.on("disconnect", () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        formatMessage(botName, `${user.username} has left the chat`)
      );

      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    }
  });
});
app.get("/join-chat", (req, res) => {
  res.render("pages/join-chat");
});
app.get("/chat", (req, res) => {
  res.render("pages/chat");
});

app.get("/users/images", checkNotAuthenticated, (req: any, res) => {
  pool
    .query(`SELECT * FROM images WHERE upload_id=$1`, [id])
    .then((results) => {
      res.render("pages/image-upload", { results: results.rows });
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/users/images/add", checkNotAuthenticated, (req, res) => {
  res.render("pages/add-image", { title: "Upload a photo" });
});

app.post("/users/images/add", upload.single("image"), (req: any, res: any) => {
  const { title, place, date } = req.body;
  let image;
  let errors = [];
  if (typeof req.file.filename === "undefined" || !title || !place || !date) {
    errors.push({ message: "Please enter all fields" });
  } else {
    image = req.file.filename;
  }

  if (errors.length > 0) {
    res.render("pages/add-image", { errors });
  } else {
    pool
      .query(
        `INSERT INTO images (image, title, date, place, upload_id) VALUES ($1, $2, $3, $4, $5)`,
        [image, title, date, place, id]
      )
      .then((results) => {
        req.flash("success_msg", "Image uploaded successfully");
        res.redirect("/users/images");
      })
      .catch((err) => {
        throw err;
      });
  }
});
app.get("/users/images/edit/:id", checkNotAuthenticated, (req, res) => {
  const imageId = req.params.id;
  pool
    .query(`SELECT * FROM images WHERE id=$1`, [imageId])
    .then((results) => {
      res.render("pages/edit-uploads", { results: results.rows });
    })
    .catch((err) => {
      throw err;
    });
});
app.post("/users/images/edit/:id", upload.single("image"), (req: any, res) => {
  const { title, place, date } = req.body;
  let newImageId = req.params.id;
  newImageId = newImageId.substring(1);
  let newImage = "";

  if (req.file) {
    newImage = req.file.filename;
    try {
      fs.unlinkSync(
        path.join(ROOT_DIR, "/public/uploads/") + req.body.old_image
      );
    } catch (err) {
      throw err;
    }
  } else {
    newImage = req.body.old_image;
  }
  pool
    .query(
      `UPDATE images SET image=$1, title=$2, place=$3, date=$4 WHERE id=$5`,
      [newImage, title, place, date, newImageId]
    )
    .then((results) => {
      req.flash("success_msg", "Upload updated successfully!");
      res.redirect("/users/images");
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/users/images/delete/:id", (req: any, res) => {
  let imageId = req.params.id;
  pool
    .query(`DELETE FROM images WHERE id=$1 RETURNING image`, [imageId])
    .then((results) => {
      if (results.rows[0].image != "") {
        try {
          fs.unlinkSync(
            path.join(ROOT_DIR, "/public/uploads/") + results.rows[0].image
          );
        } catch (err) {
          throw err;
        }
      }
      req.flash("success_msg", "Upload deleted successfully!");
      res.redirect("/users/images");
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/users/user/friends/add", checkNotAuthenticated, (req, res) => {
  res.render("pages/add-friend");
});

app.post("/users/user/friends/add", (req: any, res) => {
  const { friend_email } = req.body;
  let errors = [];
  if (!friend_email) {
    errors.push({
      message: "Please enter the email of the friend you wish to add",
    });
  }
  pool
    .query(`SELECT friends FROM users WHERE users.email=$1 AND $2 = ANY(friends);`, [email, friend_email])
    .then((results) => {
      console.log({
        log1: results.rows[0],
        log2: "reaches friends"
      })
      if(typeof results.rows[0] != "undefined"){
      errors.push({message: "Friend already added"});
      }
    })
    .catch((err) => {
      throw err;
    });
    pool
      .query(`SELECT email FROM users WHERE email=$1`, [friend_email])
      .then((results) => {
        console.log({
          log1: results.rows[0],
          log2: "reaches email"
      })
        if(results.rows[0]==="undefined") {
          errors.push({ message: "Email not found!" });
        }
      })
      .catch((err) => {
        throw err;
      });
    if (errors.length > 0) {
      console.log({
        lo1:errors,
        log2: "reaches errors"
      });
      res.render("pages/add-friend", { errors });
    } else {
      pool
        .query(
          `UPDATE users SET friends=array_append(friends, '${friend_email}') WHERE email=$1`,
          [email]
        )
        .then((results) => {
          req.flash("success_msg", "Friend added successfully!");
          res.redirect("/users/user/friends");
        })
        .catch((err) => {
          throw err;
        });
    }
});

app.get(
  "/users/user/friends/remove/:friendEmail",
  checkNotAuthenticated,
  (req: any, res) => {
    let friendEmail = req.params.friendEmail;
    pool
      .query(
        `UPDATE users SET friends=array_remove(friends, '${friendEmail}') WHERE email=$1`,
        [email]
      )
      .then((results) => {
        req.flash("success_msg", "Friend removed successfully!");
        res.redirect("/users/user/friends");
      })
      .catch((err) => {
        throw err;
      });
  }
);

app.get("/users/user/friends", checkNotAuthenticated, (req, res) => {
  pool
    .query(`SELECT friends FROM users WHERE email=$1`, [email])
    .then((results) => {
      res.render("pages/friends-list", {
        results: Object.values(results.rows[0]),
      });
    })
    .catch((err) => {
      throw err;
    });
});
app.get("/users/user/family/add", (req: any, res) => {
  pool
    .query(`SELECT * FROM family WHERE family_id=$1`, [id])
    .then((results) => {
      if (typeof results.rows[0] != "undefined") {
        req.flash("error_msg", "Family members already added.");
        res.redirect("/users/user/family");
      } else {
        res.render("pages/add-family");
      }
    })
    .catch((err) => {
      throw err;
    });
});

const cpUpload = upload.fields([
  { name: "image_child", maxCount: 1 },
  { name: "image_mother", maxCount: 1 },
  { name: "image_father", maxCount: 1 },
  { name: "image_grandmother_mother", maxCount: 1 },
  { name: "image_grandfather_mother", maxCount: 1 },
  { name: "image_grandmother_father", maxCount: 1 },
  { name: "image_grandfather_father", maxCount: 1 },
]);
app.post(
  "/users/user/family/add",
  checkNotAuthenticated,
  cpUpload,
  (req: any, res) => {
    const {
      breed_child,
      breed_mother,
      breed_father,
      breed_grandmother_mother,
      breed_grandfather_mother,
      breed_grandmother_father,
      breed_grandfather_father,
    } = req.body;
    let errors = [];
    let image_child,
      image_mother,
      image_father,
      image_grandmother_mother,
      image_grandfather_mother,
      image_grandmother_father,
      image_grandfather_father;
    if (
      !breed_child ||
      typeof req.files["image_child"] === "undefined" ||
      !breed_mother ||
      typeof req.files["image_mother"] === "undefined" ||
      !breed_father ||
      typeof req.files["image_father"] === "undefined" ||
      !breed_grandmother_mother ||
      typeof req.files["image_grandmother_mother"] === "undefined" ||
      !breed_grandfather_mother ||
      typeof req.files["image_grandfather_mother"] === "undefined" ||
      !breed_grandmother_father ||
      typeof req.files["image_grandmother_father"] === "undefined" ||
      !breed_grandfather_father ||
      typeof req.files["image_grandfather_father"] === "undefined"
    ) {
      errors.push({ message: "Please enter all fields" });
    } else {
      image_child = req.files["image_child"][0].filename;
      image_mother = req.files["image_mother"][0].filename;
      image_father = req.files["image_father"][0].filename;
      image_grandmother_mother =
        req.files["image_grandmother_mother"][0].filename;
      image_grandfather_mother =
        req.files["image_grandfather_mother"][0].filename;
      image_grandmother_father =
        req.files["image_grandmother_father"][0].filename;
      image_grandfather_father =
        req.files["image_grandfather_father"][0].filename;
    }
    if (errors.length > 0) {
      res.render("pages/add-family", { errors });
    } else {
      pool
        .query(
          `INSERT INTO family (child, mother, father, father_grandmother, father_grandfather, mother_grandmother, mother_grandfather, family_id) VALUES (
           '{"${breed_child}", "${image_child}"}',
           '{"${breed_mother}", "${image_mother}"}', 
           '{"${breed_father}", "${image_father}"}',
           '{"${breed_grandmother_father}", "${image_grandmother_father}"}',
           '{"${breed_grandfather_father}", "${image_grandfather_father}"}',
           '{"${breed_grandmother_mother}", "${image_grandmother_mother}"}',
           '{"${breed_grandfather_mother}", "${image_grandfather_mother}"}',
           ${id}
          );
           `
        )
        .then((results) => {
          res.redirect("/users/user/family");
        })
        .catch((err) => {
          throw err;
        });
    }
  }
);
app.get("/users/user/family", checkNotAuthenticated, (req, res) => {
  pool
    .query(`SELECT * FROM family WHERE family_id=$1`, [id])
    .then((results) => {
      res.render("pages/family-tree", { results: results.rows[0] });
    })
    .catch((err) => {
      throw err;
    });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/dashboard");
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/sign-in");
}

server.listen(PORT, () => {
  console.log(`Running server on port: ${PORT}.`);
});

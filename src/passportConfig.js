const LocalStrategy = require("passport-local").Strategy;
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({
    host: "localhost",
    user: "postgres",
    password: "20070712",
    database: "Heritage",
    port: 5432,
    max: 20,
  });
  
function initialize(passport) {
  const authenticateUser = (email, password, done) => {
    pool
      .query(`SELECT * FROM users WHERE email = $1`, [email])
      .then((results) => {
        if (results.rows.length > 0) {
          const user = results.rows[0];
          bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
              throw err;
            }
            if (isMatch) {
              return done(null, user);
            } else {
              return done(null, false, { message: "Password is not correct" });
            }
          });
        } else {
          return done(null, false, { message: "Email is not registered" });
        }
      })
      .catch((err) => {
        throw err;
      });
  };
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      authenticateUser
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    pool
      .query(`SELECT * FROM users WHERE id = $1`, [id])
      .then((results) => {
        return done(null, results.rows[0]);
      })
      .catch((err) => {
        throw err;
      });
  });
}

module.exports = initialize;
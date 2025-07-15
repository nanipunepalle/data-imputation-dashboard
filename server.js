// server.js
const express = require("express");
const path = require("path");
const app = express();

// Serve the React build folder
app.use(express.static(path.join(__dirname, "client/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server (React) listening on port ${PORT}`);
});

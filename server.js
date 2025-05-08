const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3521;

app.use(express.static(path.join(__dirname, 'MH-Web')));

app.listen(PORT, () =>
  console.log(`Server running → http://localhost:${PORT}`)
);
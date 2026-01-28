require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/Message');

  // Sync all model indexes
  for (const model of Object.values(mongoose.models)) {
    await model.syncIndexes();
  }

  await mongoose.disconnect();
  console.log('Indexes synced.');
})();
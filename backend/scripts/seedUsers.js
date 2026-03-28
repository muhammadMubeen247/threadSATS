// backend/scripts/seedUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Persona = require('../models/Persona');

const users = [
  { username: 'yahya', email: 'fa22-bcs-032@cuilahore.edu.pk', password: 'pottypottypotty' },
  { username: 'sikander', email: 'fa22-bcs-008@cuilahore.edu.pk', password: 'pottypottypotty' },
];

function parseEmail(email) {
  const [local] = email.split('@');
  const [sessionYear, degree, id] = local.split('-');
  const batch = sessionYear.toUpperCase();
  const rollNumber = `${batch}-${degree.toUpperCase()}-${id}`;
  const deptMap = { bcs: 'Computer Science', bse: 'Software Engineering', bit: 'Information Technology' };
  return { batch, rollNumber, department: deptMap[degree] || degree.toUpperCase() };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const u of users) {
    const { batch, rollNumber, department } = parseEmail(u.email);

    // Skip if already exists
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`Skipping ${u.email} — already exists`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(u.password, 10);

    const user = await User.create({
      username: u.username,
      email: u.email,
      password: hashedPassword,
      rollNumber,
      department,
      batch,
      isVerified: true,
    });

    // Create public persona
    const publicPersona = await Persona.create({
      ownerUserId: user._id,
      type: 'public',
      isConfigured: true,
      handle: u.username,
      displayName: u.username,
      profilePic: '',
      coverPhoto: '',
      bio: '',
      rollNumber,
      department,
      batch,
    });

    // Create anon persona
    const anonPersona = await Persona.create({
      ownerUserId: user._id,
      type: 'anon',
      isConfigured: false,
      handle: `anon_${crypto.randomBytes(6).toString('hex')}`,
      displayName: 'Anonymous',
      profilePic: '',
      coverPhoto: '',
      bio: '',
      rollNumber: '',
      department: '',
      batch: '',
    });

    user.publicPersonaId = publicPersona._id;
    user.anonPersonaId = anonPersona._id;
    await user.save();

    console.log(`Created: ${u.username} (${rollNumber}) with both personas`);
  }

  await mongoose.disconnect();
  console.log('Done.');
})();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minLength: [3, 'Username must be at least 3 characters long'],
        maxLength: [30, 'Username cannot exceed 30 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^[a-z0-9._%+-]+@cuilahore\.edu\.pk$/i,
            'Please use your COMSATS Lahore email (e.g., fa19-bcs-111@cuilahore.edu.pk)',
        ],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minLength: [6, 'Password must be at least 6 characters long'],
        select: false,
    },
    verified: {
        type: Boolean,
        default: false
    },
    profilePic: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        maxLength: [150, 'Bio cannot exceed 150 characters'],
        default: ''
    },
    followers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
    following: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
    rollNumber: {
        type: String,
    },
    department: {
        type: String,
    },
    batch: {
        type: String,
    },
    
},
{
    timestamps: true
}
);

userSchema.pre('save',async function(next){
    if(!this.isModified('password')){
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.pre('save', function (next) {
  if (this.email) {
    // Example: fa22-bcs-111@cfd.nu.edu.pk
    const emailParts = this.email.split('@')[0];
    const [batch, dept, rollNum] = emailParts.split('-');
    
    this.rollNumber = emailParts;
    this.batch = batch.toUpperCase(); // FA22, SP23, etc.
    this.department = dept.toUpperCase(); // BCS, BSE, etc.
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
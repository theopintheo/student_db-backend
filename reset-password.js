const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

async function resetPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/edu_management');
        console.log('Connected to MongoDB');
        
        // Generate new hash
        const newPassword = 'NewPassword@123'; // Change this to your desired password
        const newHash = await bcrypt.hash(newPassword, 10);
        
        console.log('Generated hash:', newHash);
        console.log('Use password:', newPassword);
        
        // Update admin user in database
        const User = require('./src/models/User');
        const result = await User.updateOne(
            { email: 'admin@edumanagement.com' },
            { password: newHash }
        );
        
        if (result.modifiedCount > 0) {
            console.log('✅ Admin password updated successfully!');
            console.log('New password:', newPassword);
        } else {
            console.log('⚠️ Admin user not found or password already set');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

resetPassword();
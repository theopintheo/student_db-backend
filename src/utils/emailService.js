const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const handlebars = require('handlebars');

class EmailService {
    constructor() {
        // Initialize transporter with fallback options
        this.transporter = null;
        this.initTransporter();
        
        this.templates = {};
        this.loadTemplates();
    }

    initTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: process.env.SMTP_USER || 'your-email@gmail.com',
                    pass: process.env.SMTP_PASS || 'your-app-password'
                },
                tls: {
                    rejectUnauthorized: false
                },
                debug: process.env.NODE_ENV === 'development',
                logger: process.env.NODE_ENV === 'development'
            });
            
            console.log('📧 Email transporter initialized');
        } catch (error) {
            console.error('❌ Failed to initialize email transporter:', error);
            // Create a mock transporter for development
            this.transporter = {
                sendMail: async (mailOptions) => {
                    console.log('📨 Mock email sent (development mode):', {
                        to: mailOptions.to,
                        subject: mailOptions.subject
                    });
                    return { messageId: 'mock-message-id', response: 'Mock response' };
                },
                verify: async () => {
                    console.log('✅ Mock email verification successful');
                    return true;
                }
            };
        }
    }

    async loadTemplates() {
        try {
            const templatesDir = path.join(__dirname, '../templates/email');
            
            // Check if templates directory exists
            try {
                await fs.access(templatesDir);
            } catch {
                console.log('ℹ️ Email templates directory not found, using default templates');
                this.loadDefaultTemplates();
                return;
            }
            
            const templateFiles = await fs.readdir(templatesDir);
            
            for (const file of templateFiles) {
                if (file.endsWith('.html') || file.endsWith('.hbs')) {
                    const templateName = path.basename(file, path.extname(file));
                    const templatePath = path.join(templatesDir, file);
                    const templateContent = await fs.readFile(templatePath, 'utf-8');
                    this.templates[templateName] = handlebars.compile(templateContent);
                    console.log(`📄 Loaded email template: ${templateName}`);
                }
            }
            
            console.log(`✅ Loaded ${Object.keys(this.templates).length} email templates`);
        } catch (error) {
            console.error('❌ Error loading email templates:', error);
            this.loadDefaultTemplates();
        }
    }

    loadDefaultTemplates() {
        // Create default templates in memory
        this.templates = {
            welcome: this.compileDefaultTemplate('welcome'),
            'password-reset': this.compileDefaultTemplate('password-reset'),
            'password-changed': this.compileDefaultTemplate('password-changed'),
            'student-admission': this.compileDefaultTemplate('student-admission'),
            'payment-receipt': this.compileDefaultTemplate('payment-receipt'),
            'assignment-notification': this.compileDefaultTemplate('assignment-notification'),
            'attendance-notification': this.compileDefaultTemplate('attendance-notification'),
            'certificate-issue': this.compileDefaultTemplate('certificate-issue'),
            'lead-followup': this.compileDefaultTemplate('lead-followup'),
            'bulk': this.compileDefaultTemplate('bulk')
        };
    }

    compileDefaultTemplate(templateName) {
        const templates = {
            welcome: (data) => this.getDefaultTemplate('Welcome to ' + data.appName, data),
            'password-reset': (data) => this.getDefaultTemplate('Password Reset Request', data),
            'password-changed': (data) => this.getDefaultTemplate('Password Changed Successfully', data),
            'student-admission': (data) => this.getDefaultTemplate('Welcome to Our Institute', data),
            'payment-receipt': (data) => this.getDefaultTemplate('Payment Receipt', data),
            'assignment-notification': (data) => this.getDefaultTemplate('New Assignment Notification', data),
            'attendance-notification': (data) => this.getDefaultTemplate('Attendance Marked', data),
            'certificate-issue': (data) => this.getDefaultTemplate('Course Completion Certificate', data),
            'lead-followup': (data) => this.getDefaultTemplate('Lead Follow-up Reminder', data),
            'bulk': (data) => this.getDefaultTemplate(data.subject || 'Notification', data)
        };
        
        return templates[templateName] || ((data) => this.getDefaultTemplate('Notification', data));
    }

    async sendEmail(to, subject, templateName, data = {}, attachments = []) {
        try {
            // Validate email configuration
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            // Default data
            const emailData = {
                ...data,
                appName: process.env.APP_NAME || 'Education Management System',
                appUrl: process.env.CLIENT_URL || 'http://localhost:3000',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@edumanage.com',
                currentYear: new Date().getFullYear(),
                timestamp: new Date().toLocaleString(),
                subject: subject
            };

            // Get template or use default
            let html;
            if (this.templates[templateName]) {
                html = this.templates[templateName](emailData);
            } else {
                html = this.getDefaultTemplate(subject, emailData);
            }

            const mailOptions = {
                from: {
                    name: process.env.FROM_NAME || 'Edu Management System',
                    address: process.env.FROM_EMAIL || 'noreply@edumanage.com'
                },
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: subject,
                html: html,
                attachments: attachments
            };

            // In development mode, log instead of sending
            if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
                console.log('📧 Development Email:', {
                    to: mailOptions.to,
                    subject: mailOptions.subject,
                    preview: html.substring(0, 200) + '...'
                });
                return {
                    success: true,
                    messageId: 'dev-mode-' + Date.now(),
                    preview: true
                };
            }

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${to}: ${info.messageId}`);
            
            return {
                success: true,
                messageId: info.messageId,
                response: info.response
            };
        } catch (error) {
            console.error('❌ Error sending email:', error);
            
            // Return error object instead of throwing
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    getDefaultTemplate(subject, data) {
        const style = `
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 30px; }
                .header h1 { margin: 0; font-size: 24px; }
                .content { padding: 20px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; text-align: center; }
                .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
                .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; }
                .highlight { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
            </style>
        `;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${subject}</title>
                ${style}
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${data.appName}</h1>
                        <p>${subject}</p>
                    </div>
                    <div class="content">
                        ${data.content || `
                            <p>Dear ${data.name || 'User'},</p>
                            <p>This is an automated message from ${data.appName}.</p>
                        `}
                        
                        ${data.actionUrl ? `
                            <div style="text-align: center;">
                                <a href="${data.actionUrl}" class="button">
                                    ${data.actionText || 'Take Action'}
                                </a>
                            </div>
                        ` : ''}
                        
                        ${data.importantNote ? `
                            <div class="highlight">
                                <strong>Note:</strong> ${data.importantNote}
                            </div>
                        ` : ''}
                        
                        ${data.additionalInfo ? `
                            <div class="info-box">
                                ${data.additionalInfo}
                            </div>
                        ` : ''}
                    </div>
                    <div class="footer">
                        <p>&copy; ${data.currentYear} ${data.appName}. All rights reserved.</p>
                        <p>This is an automated message. Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    // 🔐 SECURITY & AUTHENTICATION EMAILS
    async sendWelcomeEmail(user, password = null) {
        const subject = 'Welcome to Education Management System';
        const data = {
            name: user.profile?.firstName || user.username,
            content: `
                <p>Welcome to ${process.env.APP_NAME || 'Education Management System'}!</p>
                <p>Your account has been successfully created with the following details:</p>
                <div class="info-box">
                    <p><strong>Username:</strong> ${user.username}</p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Role:</strong> ${user.role}</p>
                    ${password ? `<p><strong>Temporary Password:</strong> ${password}</p>` : ''}
                </div>
                <p>Please login and update your password immediately for security.</p>
            `,
            actionUrl: `${process.env.CLIENT_URL}/login`,
            actionText: 'Login Now',
            importantNote: password ? 'Change your password after first login.' : 'Keep your login credentials secure.'
        };

        return this.sendEmail(user.email, subject, 'welcome', data);
    }

    async sendPasswordResetEmail(user, resetToken) {
        const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
        const subject = 'Password Reset Request';
        const data = {
            name: user.profile?.firstName || user.username,
            content: `
                <p>We received a password reset request for your account.</p>
                <p>Click the button below to reset your password:</p>
            `,
            actionUrl: resetUrl,
            actionText: 'Reset Password',
            importantNote: 'This link expires in 10 minutes. If you didn\'t request this, ignore this email.'
        };

        return this.sendEmail(user.email, subject, 'password-reset', data);
    }

    async sendPasswordChangedEmail(user) {
        const subject = 'Password Changed Successfully';
        const data = {
            name: user.profile?.firstName || user.username,
            content: `
                <p>Your password has been successfully changed.</p>
                <p>If you didn't make this change, contact support immediately.</p>
            `,
            importantNote: 'For security, review your account activity if this wasn\'t you.'
        };

        return this.sendEmail(user.email, subject, 'password-changed', data);
    }

    // 🎓 STUDENT-RELATED EMAILS
    async sendStudentAdmissionEmail(student, enrollment = null) {
        const subject = 'Student Admission Confirmation';
        const data = {
            name: student.personalDetails.fullName,
            content: `
                <p>Congratulations on your admission!</p>
                <div class="info-box">
                    <p><strong>Student ID:</strong> ${student.studentId}</p>
                    <p><strong>Name:</strong> ${student.personalDetails.fullName}</p>
                    <p><strong>Admission Date:</strong> ${new Date(student.admissionDetails.admissionDate).toLocaleDateString()}</p>
                    ${enrollment ? `<p><strong>Course:</strong> ${enrollment.course?.name || 'N/A'}</p>` : ''}
                </div>
                <p>Please complete your profile and upload required documents.</p>
            `,
            actionUrl: `${process.env.CLIENT_URL}/student/login`,
            actionText: 'Access Student Portal'
        };

        return this.sendEmail(student.personalDetails.email, subject, 'student-admission', data);
    }

    // 💰 PAYMENT-RELATED EMAILS
    async sendPaymentReceipt(payment, student) {
        const subject = `Payment Receipt - ${payment.receiptNumber}`;
        const data = {
            name: student.personalDetails.fullName,
            content: `
                <p>Thank you for your payment. Receipt details:</p>
                <div class="info-box">
                    <p><strong>Receipt:</strong> ${payment.receiptNumber}</p>
                    <p><strong>Amount:</strong> ₹${payment.amount}</p>
                    <p><strong>Date:</strong> ${new Date(payment.paymentDate).toLocaleDateString()}</p>
                    <p><strong>Mode:</strong> ${payment.paymentMode}</p>
                    <p><strong>Status:</strong> ${payment.status}</p>
                </div>
            `,
            additionalInfo: 'Keep this receipt for your records.'
        };

        return this.sendEmail(student.personalDetails.email, subject, 'payment-receipt', data);
    }

    // 📚 COURSE & ACADEMIC EMAILS
    async sendAssignmentNotification(student, assignment, course) {
        const subject = `New Assignment: ${assignment.title}`;
        const data = {
            name: student.personalDetails.fullName,
            content: `
                <p>New assignment assigned for ${course.name}:</p>
                <div class="info-box">
                    <p><strong>Assignment:</strong> ${assignment.title}</p>
                    <p><strong>Course:</strong> ${course.name}</p>
                    <p><strong>Due Date:</strong> ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'}</p>
                    <p><strong>Max Marks:</strong> ${assignment.maxMarks || 'N/A'}</p>
                </div>
            `,
            actionUrl: `${process.env.CLIENT_URL}/student/assignments`,
            actionText: 'View Assignment',
            importantNote: 'Submit before due date to avoid penalties.'
        };

        return this.sendEmail(student.personalDetails.email, subject, 'assignment-notification', data);
    }

    async sendCertificateEmail(student, certificate, course) {
        const subject = `Certificate: ${course.name}`;
        const data = {
            name: student.personalDetails.fullName,
            content: `
                <p>Congratulations on completing ${course.name}!</p>
                <div class="info-box">
                    <p><strong>Certificate ID:</strong> ${certificate.certificateId}</p>
                    <p><strong>Course:</strong> ${course.name}</p>
                    <p><strong>Issued:</strong> ${new Date(certificate.issuedDate).toLocaleDateString()}</p>
                </div>
            `,
            actionUrl: certificate.downloadUrl,
            actionText: 'Download Certificate'
        };

        return this.sendEmail(student.personalDetails.email, subject, 'certificate-issue', data);
    }

    // 📈 LEAD MANAGEMENT EMAILS
    async sendLeadFollowUpEmail(lead, user, followUpDetails) {
        const subject = `Follow-up: ${lead.fullName}`;
        const data = {
            name: user.profile?.firstName || user.username,
            content: `
                <p>Follow-up reminder for lead:</p>
                <div class="info-box">
                    <p><strong>Lead:</strong> ${lead.fullName}</p>
                    <p><strong>Phone:</strong> ${lead.phone}</p>
                    <p><strong>Scheduled:</strong> ${followUpDetails.date}</p>
                    <p><strong>Notes:</strong> ${followUpDetails.notes}</p>
                </div>
            `,
            actionUrl: `${process.env.CLIENT_URL}/leads/${lead._id}`,
            actionText: 'View Lead',
            importantNote: 'Timely follow-up improves conversion rates.'
        };

        return this.sendEmail(user.email, subject, 'lead-followup', data);
    }

    async sendLeadConvertedEmail(lead, student) {
        const subject = `Lead Converted: ${lead.fullName}`;
        const data = {
            content: `
                <p>Lead successfully converted to student!</p>
                <div class="info-box">
                    <p><strong>Lead:</strong> ${lead.fullName}</p>
                    <p><strong>Student ID:</strong> ${student.studentId}</p>
                    <p><strong>Conversion Date:</strong> ${new Date().toLocaleDateString()}</p>
                </div>
            `
        };

        return this.sendEmail(process.env.ADMIN_EMAIL || 'admin@edumanage.com', subject, 'lead-converted', data);
    }

    // 📊 BULK & SYSTEM EMAILS
    async sendBulkNotification(recipients, subject, message) {
        const data = {
            content: message,
            isBulk: true
        };

        const results = [];
        for (const recipient of recipients) {
            const result = await this.sendEmail(
                recipient.email,
                subject,
                'bulk',
                { ...data, name: recipient.name }
            );
            results.push(result);
        }

        return {
            total: recipients.length,
            successful: results.filter(r => r.success).length,
            results
        };
    }

    async sendSystemAlert(subject, message, severity = 'info') {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@edumanage.com';
        const data = {
            content: `
                <div class="${severity === 'error' ? 'highlight' : 'info-box'}">
                    <p><strong>${subject}</strong></p>
                    <p>${message}</p>
                    <p><em>System generated alert at ${new Date().toLocaleString()}</em></p>
                </div>
            `
        };

        return this.sendEmail(adminEmail, `System Alert: ${subject}`, 'system-alert', data);
    }

    // 🔧 UTILITY METHODS
    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Email server connection verified');
            return true;
        } catch (error) {
            console.error('❌ Email server connection failed:', error.message);
            return false;
        }
    }

    getStats() {
        return {
            templatesLoaded: Object.keys(this.templates).length,
            smtpConfigured: !!process.env.SMTP_HOST,
            inDevelopment: process.env.NODE_ENV === 'development'
        };
    }
}

// Create and export singleton instance
const emailService = new EmailService();

// Initialize on import
emailService.verifyConnection().then(success => {
    if (success) {
        console.log('📧 Email service ready');
    } else {
        console.log('⚠️ Email service running in development/mock mode');
    }
});

module.exports = emailService;
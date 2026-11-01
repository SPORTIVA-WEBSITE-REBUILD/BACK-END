import mongoose from 'mongoose';

const { Schema } = mongoose;

export const EMAIL_STATUS = ['PENDING', 'SENT', 'FAILED'];

const WebinarRegistrationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    consentAt: { type: Date, required: true },

    emailStatus: { type: String, enum: EMAIL_STATUS, default: 'PENDING' },
    emailSentAt: { type: Date },
    // Deliberately short and never the raw SMTP error, which can carry
    // connection details — see sendWebinarConfirmation in lib/mailer.js.
    emailError: { type: String, trim: true, maxlength: 200, default: '' },
    emailAttempts: { type: Number, default: 0 },

    reminderDayBeforeSentAt: { type: Date },
    reminderHourBeforeSentAt: { type: Date },
  },
  { timestamps: true },
);

WebinarRegistrationSchema.index({ email: 1 }, { unique: true });
WebinarRegistrationSchema.index({ emailStatus: 1, createdAt: -1 });
WebinarRegistrationSchema.index({ createdAt: -1 });
// Reminder jobs scan for "SENT and not yet reminded" on every tick.
WebinarRegistrationSchema.index({ emailStatus: 1, reminderDayBeforeSentAt: 1 });
WebinarRegistrationSchema.index({ emailStatus: 1, reminderHourBeforeSentAt: 1 });

export default mongoose.models.WebinarRegistration
  || mongoose.model('WebinarRegistration', WebinarRegistrationSchema);

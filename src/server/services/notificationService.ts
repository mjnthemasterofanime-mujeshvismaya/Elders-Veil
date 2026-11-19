import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import { db } from '../../db/index.ts';
import { integrationConfigs, notificationDeliveries, notifications } from '../../db/schema.ts';

export const OFFICIAL_DIRECTOR_EMAIL = process.env.DIRECTOR_EMAIL || 'black0warrior0143@gmail.com';
export const OFFICIAL_DIRECTOR_PHONE = process.env.DIRECTOR_PHONE || '+919443498638';

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

export async function createInternalNotification(params: {
  recipientUserId?: number | null;
  recipientRole?: string | null;
  type: string;
  title: string;
  body: string;
  linkTab?: string;
}) {
  try {
    const [inserted] = await db
      .insert(notifications)
      .values({
        recipientUserId: params.recipientUserId ?? null,
        recipientRole: params.recipientRole ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        linkTab: params.linkTab ?? null,
      })
      .returning();

    if (ioInstance) {
      if (params.recipientUserId) {
        ioInstance.to(`user:${params.recipientUserId}`).emit('notification:new', inserted);
      }
      if (params.recipientRole) {
        ioInstance.to(`role:${params.recipientRole}`).emit('notification:new', inserted);
      }
    }
    return inserted;
  } catch (err) {
    console.error('Failed to create internal notification:', err);
    return null;
  }
}

async function getConfigValue(key: string): Promise<Record<string, unknown>> {
  try {
    const rows = await db.select().from(integrationConfigs).where(eq(integrationConfigs.key, key));
    return rows[0]?.config ?? {};
  } catch {
    return {};
  }
}

export async function sendStudioEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  const savedCfg = await getConfigValue('email_settings');
  const host = (savedCfg.smtpHost as string) || process.env.SMTP_HOST || '';
  const port = Number((savedCfg.smtpPort as string | number) || process.env.SMTP_PORT || 465);
  const secure =
    savedCfg.smtpSecure !== undefined
      ? Boolean(savedCfg.smtpSecure)
      : process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_USER || (savedCfg.smtpUser as string) || '';
  const pass = process.env.SMTP_PASS || '';
  const from =
    (savedCfg.smtpFrom as string) ||
    process.env.SMTP_FROM ||
    `Elder'sVeil Anime Studio <${OFFICIAL_DIRECTOR_EMAIL}>`;

  if (!host || !user || !pass) {
    const errorMessage =
      'SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required on server).';
    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        channel: 'EMAIL',
        recipient: params.to,
        subject: params.subject,
        payloadSummary: params.text.slice(0, 280),
        status: 'AWAITING_CONFIG',
        provider: 'SMTP',
        errorMessage,
        attempts: 1,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
      })
      .returning();
    return delivery;
  }

  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      const [delivery] = await db
        .insert(notificationDeliveries)
        .values({
          channel: 'EMAIL',
          recipient: params.to,
          subject: params.subject,
          payloadSummary: params.text.slice(0, 280),
          status: 'SENT',
          provider: host.includes('gmail') ? 'GMAIL_SMTP' : 'SMTP',
          errorMessage: null,
          attempts: attempt,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
        })
        .returning();
      return delivery;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'Unknown SMTP error';
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  const [failed] = await db
    .insert(notificationDeliveries)
    .values({
      channel: 'EMAIL',
      recipient: params.to,
      subject: params.subject,
      payloadSummary: params.text.slice(0, 280),
      status: 'FAILED',
      provider: host.includes('gmail') ? 'GMAIL_SMTP' : 'SMTP',
      errorMessage: lastError,
      attempts: 2,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    })
    .returning();
  return failed;
}

export async function sendStudioSms(params: {
  to: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  const savedCfg = await getConfigValue('sms_settings');
  const provider = ((savedCfg.provider as string) || process.env.SMS_PROVIDER || 'TWILIO').toUpperCase();

  if (provider === 'MSG91') {
    const authKey = process.env.MSG91_AUTH_KEY || '';
    const templateId = (savedCfg.msg91TemplateId as string) || process.env.MSG91_TEMPLATE_ID || '';
    const senderId = (savedCfg.msg91SenderId as string) || process.env.MSG91_SENDER_ID || 'ELDRVL';

    if (!authKey || !templateId) {
      const [delivery] = await db
        .insert(notificationDeliveries)
        .values({
          channel: 'SMS',
          recipient: params.to,
          subject: null,
          payloadSummary: params.message.slice(0, 280),
          status: 'AWAITING_CONFIG',
          provider: 'MSG91',
          errorMessage: 'MSG91 credentials not configured (MSG91_AUTH_KEY and MSG91_TEMPLATE_ID required).',
          attempts: 1,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
        })
        .returning();
      return delivery;
    }

    try {
      const cleanMobile = params.to.replace(/[^0-9]/g, '');
      const resp = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          authkey: authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          sender: senderId,
          short_url: '0',
          mobiles: cleanMobile,
          message: params.message,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(`MSG91 HTTP ${resp.status}: ${JSON.stringify(json)}`);
      }
      const [delivery] = await db
        .insert(notificationDeliveries)
        .values({
          channel: 'SMS',
          recipient: params.to,
          subject: null,
          payloadSummary: params.message.slice(0, 280),
          status: 'SENT',
          provider: 'MSG91',
          errorMessage: null,
          attempts: 1,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
        })
        .returning();
      return delivery;
    } catch (err: unknown) {
      const [failed] = await db
        .insert(notificationDeliveries)
        .values({
          channel: 'SMS',
          recipient: params.to,
          subject: null,
          payloadSummary: params.message.slice(0, 280),
          status: 'FAILED',
          provider: 'MSG91',
          errorMessage: err instanceof Error ? err.message : 'MSG91 request failed',
          attempts: 1,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
        })
        .returning();
      return failed;
    }
  }

  // Default: Twilio adapter
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const fromNumber = (savedCfg.twilioFromNumber as string) || process.env.TWILIO_FROM_NUMBER || '';

  if (!accountSid || !authToken || !fromNumber) {
    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        channel: 'SMS',
        recipient: params.to,
        subject: null,
        payloadSummary: params.message.slice(0, 280),
        status: 'AWAITING_CONFIG',
        provider: 'TWILIO',
        errorMessage:
          'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required).',
        attempts: 1,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
      })
      .returning();
    return delivery;
  }

  try {
    const form = new URLSearchParams();
    form.set('To', params.to);
    form.set('From', fromNumber);
    form.set('Body', params.message);

    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(`Twilio HTTP ${resp.status}: ${JSON.stringify(data)}`);
    }

    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        channel: 'SMS',
        recipient: params.to,
        subject: null,
        payloadSummary: params.message.slice(0, 280),
        status: 'SENT',
        provider: 'TWILIO',
        errorMessage: null,
        attempts: 1,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
      })
      .returning();
    return delivery;
  } catch (err: unknown) {
    const [failed] = await db
      .insert(notificationDeliveries)
      .values({
        channel: 'SMS',
        recipient: params.to,
        subject: null,
        payloadSummary: params.message.slice(0, 280),
        status: 'FAILED',
        provider: 'TWILIO',
        errorMessage: err instanceof Error ? err.message : 'Twilio request failed',
        attempts: 1,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
      })
      .returning();
    return failed;
  }
}

export async function notifyDirectorOfNewApplication(params: {
  trackingCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentName: string;
  skills: string;
  portfolioUrl?: string | null;
  appUrl: string;
}) {
  const subject = "New Member Application — Elder'sVeil Anime Studio";
  const reviewLink = `${params.appUrl.replace(/\/$/, '')}/?view=director&tab=applications&code=${encodeURIComponent(params.trackingCode)}`;
  const textBody = [
    "New Member Application — Elder'sVeil Anime Studio",
    '',
    `Applicant Name: ${params.fullName}`,
    `Applicant Email: ${params.email}`,
    `Phone: ${params.phone}`,
    `Selected Department: ${params.departmentName}`,
    `Skills: ${params.skills}`,
    `Portfolio Link: ${params.portfolioUrl || 'Not provided'}`,
    `Tracking Code: ${params.trackingCode}`,
    `Application Review Link: ${reviewLink}`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: sans-serif; background: #0b0d12; color: #f1f3f7; padding: 24px; border-radius: 8px;">
      <h2 style="color: #f59e0b; margin-top: 0;">New Member Application — Elder'sVeil Anime Studio</h2>
      <p>A new candidate has applied to join the studio.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #9ca3af;">Applicant Name</td><td style="padding: 6px 0;"><strong>${params.fullName}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Email</td><td style="padding: 6px 0;">${params.email}</td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Phone</td><td style="padding: 6px 0;">${params.phone}</td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Department</td><td style="padding: 6px 0;">${params.departmentName}</td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Skills</td><td style="padding: 6px 0;">${params.skills}</td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Portfolio</td><td style="padding: 6px 0;">${params.portfolioUrl || 'Not provided'}</td></tr>
        <tr><td style="padding: 6px 0; color: #9ca3af;">Tracking Code</td><td style="padding: 6px 0; font-family: monospace;">${params.trackingCode}</td></tr>
      </table>
      <p><a href="${reviewLink}" style="display:inline-block; background:#d97706; color:#0b0d12; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:600;">Review Application in Director's Office</a></p>
    </div>
  `;

  const smsText = `Elder'sVeil Studio: New application (${params.trackingCode}) from ${params.fullName} for ${params.departmentName}. Review in Director's Office.`;

  const [internalNotif, emailDelivery, smsDelivery] = await Promise.all([
    createInternalNotification({
      recipientRole: 'DIRECTOR',
      type: 'NEW_APPLICATION',
      title: `New Application: ${params.fullName} (${params.departmentName})`,
      body: `Tracking Code ${params.trackingCode} — Skills: ${params.skills}`,
      linkTab: 'applications',
    }),
    sendStudioEmail({
      to: OFFICIAL_DIRECTOR_EMAIL,
      subject,
      text: textBody,
      html: htmlBody,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: params.trackingCode,
    }),
    sendStudioSms({
      to: OFFICIAL_DIRECTOR_PHONE,
      message: smsText,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: params.trackingCode,
    }),
  ]);

  return { internalNotif, emailDelivery, smsDelivery };
}

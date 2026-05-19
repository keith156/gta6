import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

let db: FirebaseFirestore.Firestore | null = null;
let firebaseInitialized = false;
let firebaseStartupError: string | null = null;

function initFirebase() {
  if (firebaseInitialized) return;
  
  let firebaseConfig: any = {};
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.warn("Could not read firebase-applet-config.json");
  }

  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        const serviceAccount = JSON.parse(rawKey);
        initializeApp({
          credential: cert(serviceAccount),
          projectId: firebaseConfig.projectId || serviceAccount.project_id
        });
      } catch (e: any) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:", e.message);
        firebaseStartupError = "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Please check your Vercel environment variables.";
        return;
      }
    } else if (firebaseConfig.projectId) {
      initializeApp({
        projectId: firebaseConfig.projectId
      });
    } else {
      console.warn("Firebase not properly configured. Missing FIREBASE_SERVICE_ACCOUNT_KEY.");
      firebaseStartupError = "Firebase not configured. Missing FIREBASE_SERVICE_ACCOUNT_KEY in environment.";
      return;
    }
  }

  try {
    db = firebaseConfig.firestoreDatabaseId 
      ? getFirestore(firebaseConfig.firestoreDatabaseId)
      : getFirestore();
    firebaseInitialized = true;
  } catch (e) {
    try {
      db = getFirestore();
      firebaseInitialized = true;
    } catch (inner: any) {
      console.error("Failed to initialize Firestore:", inner.message);
      firebaseStartupError = "Failed to initialize Firestore.";
    }
  }
}

// Call init once safely
try {
  initFirebase();
} catch (e: any) {
  console.error("Unhandled error initializing Firebase:", e);
  firebaseStartupError = "Unhandled server error initializing Firebase.";
}

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    (req as any).rawBody = buf;
  }
}));

app.post("/api/webhooks/livepay", async (req, res) => {
  try {
    if (firebaseStartupError) {
      return res.status(500).json({ error: firebaseStartupError });
    }
    const signatureHeader = req.headers["x-webhook-signature"] as string;
    const webhookSecret = process.env.LIVEPAY_WEBHOOK_SECRET;

    if (!signatureHeader || !webhookSecret) {
      console.error("Missing signature or webhook secret");
      return res.status(400).send("Missing signature or secret");
    }

    const parts = signatureHeader.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = value;
      if (key === 'v') signature = value;
    }

    if (!timestamp || !signature) {
      return res.status(400).send("Invalid signature header format");
    }

    const payload = req.body;
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/livepay`;
    
    const stringToSign = webhookUrl + timestamp + 
                        (payload.status || "") + 
                        (payload.customer_reference || "") + 
                        (payload.internal_reference || "");

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(stringToSign)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Webhook signature mismatch", { expected: expectedSignature, received: signature });
      return res.status(401).send("Invalid webhook signature");
    }

    console.log("Received valid Livepay webhook:", payload);
    
    const ref = payload.customer_reference;
    const rawStatus = (payload.status || '').toLowerCase();
    
    if (ref) {
      if (!db) {
        throw new Error("Firebase DB is not initialized. Please configure FIREBASE_SERVICE_ACCOUNT_KEY in Vercel.");
      }
      let finalStatus = rawStatus;
      if (rawStatus.includes('success') || rawStatus.includes('completed')) {
        finalStatus = 'success';
      } else if (rawStatus.includes('fail') || rawStatus.includes('cancel') || rawStatus.includes('error')) {
        finalStatus = 'failed';
      }

      await db.collection('payments').doc(ref).set({
        status: finalStatus,
        updatedAt: new Date()
      }, { merge: true });

      console.log(`Updated payment ${ref} to status: ${finalStatus}`);
    }

    res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/payment-status/:ref", async (req, res) => {
  try {
    if (firebaseStartupError) {
      return res.status(500).json({ error: firebaseStartupError });
    }
    if (!db) {
      return res.status(500).json({ error: "Firebase is not configured" });
    }
    const doc = await db.collection('payments').doc(req.params.ref).get();
    if (doc.exists) {
      res.json({ status: doc.data()?.status || 'unknown' });
    } else {
      res.json({ status: 'unknown' });
    }
  } catch (e) {
    console.error("Error fetching payment status:", e);
    res.json({ status: 'unknown' });
  }
});

app.post("/api/collect-money", async (req, res) => {
  try {
    if (firebaseStartupError) {
      return res.status(500).json({ error: firebaseStartupError });
    }
    const { phoneNumber, provider, amount, email } = req.body;
    const apiKey = process.env.LIVEPAY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API key is not configured" });
    }

    if (!process.env.LIVEPAY_ACCOUNT_NUMBER) {
      return res.status(500).json({ error: "Livepay account number is not configured in environment variables" });
    }

    const reference = `GTA6${Date.now()}`;
    
    if (!db) {
      return res.status(500).json({ error: "Firebase DB is not initialized. Please configure FIREBASE_SERVICE_ACCOUNT_KEY in Vercel." });
    }
    
    await db.collection('payments').doc(reference).set({
      status: 'pending',
      amount: amount,
      phoneNumber: phoneNumber || null,
      updatedAt: new Date()
    });

    const payload = {
      accountNumber: process.env.LIVEPAY_ACCOUNT_NUMBER,
      phoneNumber: phoneNumber,
      amount: amount,     
      currency: "UGX",
      reference: reference, 
      description: "Payment for GTA 6 Early Access"
    };

    console.log("Sending Livepay payload:", Object.keys(payload));

    const response = await fetch("https://livepay.me/api/collect-money", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        errorData = JSON.parse(text);
        console.error("Livepay API Error Response:", errorData);
      } catch(e) {
        errorData = { message: response.statusText };
        console.error("Livepay API Error Text:", errorData);
      }
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Payment error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

export default app;

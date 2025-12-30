import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.use(cors());

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error(
    "⚠️  STRIPE_SECRET_KEY is not set. Set it in your .env file before starting the server."
  );
}

const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: "2022-11-15" }) : null;

app.post("/api/makepayment", async (req, res) => {
  try {
    const products = req?.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "No products provided in request body." });
    }

    if (!stripe) {
      return res.status(500).json({
        error:
          "Stripe is not configured on server. Make sure STRIPE_SECRET_KEY is set in environment.",
      });
    }

    const lineItems = products
      .map((p) => {
        const priceNum = Number(p?.price || 0);
        const qty = Number(p?.count || 1);

        if (!priceNum || priceNum <= 0 || qty <= 0) return null;

        return {
          price_data: {
            currency: "inr",
            product_data: {
              name: String(p?.model || p?.name || "Product"),
              description: p?.description ? String(p.description).slice(0, 200) : undefined,
            },
            unit_amount: Math.round(priceNum * 100),
          },
          quantity: Math.max(1, Math.floor(qty)),
        };
      })
      .filter(Boolean);

    if (lineItems.length === 0) {
      return res.status(400).json({ error: "No valid line items (check price/count fields)." });
    }

    const origin = req.headers.origin || "http://localhost:5173";

    const transactionId = "TXN" + Date.now();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
      metadata: {
        transactionId,
      },

    });

    return res.status(200).json({ id: session.id, url: session.url || null });
  } catch (err) {
    console.error("Stripe Payment Error:", err);
    return res.status(500).json({
      error: err?.message || "Unknown server error while creating payment session.",
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});

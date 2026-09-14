// app.js - Main application entry point

import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import serviceFormRoutes from './src/routes/serviceForms.js';
import analyticsRoutes from './src/routes/analytics.js';

const app = express();
const PORT = process.env.PORT || 3003;
const __dirname = path.resolve();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Business info used on the printed quotation
app.get('/api/config', (req, res) => {
  res.json({
    BUSINESS_NAME: process.env.BUSINESS_NAME,
    BUSINESS_ABN: process.env.BUSINESS_ABN,
    ADDRESS: process.env.ADDRESS,
    WEBSITE: process.env.WEBSITE,
    EMAIL: process.env.EMAIL,
    PHONE: process.env.PHONE,
    SERVICE_FORM_DISCLAIMER: process.env.SERVICE_FORM_DISCLAIMER,
  });
});

app.use('/api/service-forms', serviceFormRoutes);
app.use('/api/analytics', analyticsRoutes);

// Static pages
const page = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', `${name}.html`));
app.get('/', page('index'));
app.get('/service-form', page('service-form'));
app.get('/records', page('records'));
app.get('/service-detail', page('service-detail'));
app.get('/print-form', page('print-form'));
app.get('/analytics', page('analytics'));

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

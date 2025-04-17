require('dotenv').config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const { Pool, Client } = require("pg");
const cors = require("cors");
const fs = require("fs");
const AdmZip = require('adm-zip');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup CORS
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://3.90.173.100:8084",
    "http://3.90.173.100:8083"
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload setup
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

// Database setup
const client = new Client({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'ajay_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
});

const pool = new Pool({
  user: "postgres",
  host: "postgres",
  database: "ajay_db",
  password: "admin123",
  port: 5432,
});

// Connect to DB
const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    await client.query(`
      CREATE TABLE IF NOT EXISTS ajay_table (
        id SERIAL PRIMARY KEY,
        emp_name VARCHAR(255) NOT NULL,
        emp_email VARCHAR(255) UNIQUE NOT NULL,
        emp_dob DATE,
        emp_mobile VARCHAR(20),
        emp_address TEXT,
        emp_city VARCHAR(100),
        emp_state VARCHAR(100),
        emp_zipcode VARCHAR(20),
        emp_bank VARCHAR(255),
        emp_account VARCHAR(50),
        emp_ifsc VARCHAR(20),
        emp_job_role VARCHAR(255),
        emp_department VARCHAR(255),
        emp_experience_status BOOLEAN,
        emp_company_name VARCHAR(255),
        emp_years_of_experience INTEGER,
        emp_joining_date DATE,
        emp_experience_doc VARCHAR(255),
        emp_ssc_doc VARCHAR(255),
        emp_inter_doc VARCHAR(255),
        emp_grad_doc VARCHAR(255),
        emp_terms_accepted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Verified table exists");
  } catch (err) {
    console.error("DB connection error:", err);
    setTimeout(connectToDatabase, 5000);
  }
};
connectToDatabase();

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper to clean up failed uploads
const cleanupFiles = (files) => {
  if (!files) return;
  Object.values(files).forEach(fileArray => {
    fileArray.forEach(file => {
      try {
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        console.error("File cleanup error:", err);
      }
    });
  });
};

// Save employee with file uploads
app.post("/save-employee", upload.fields([
  { name: "emp_experience_doc", maxCount: 1 },
  { name: "emp_ssc_doc", maxCount: 1 },
  { name: "emp_inter_doc", maxCount: 1 },
  { name: "emp_grad_doc", maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.body.emp_name || !req.body.emp_email) {
      cleanupFiles(req.files);
      return res.status(400).json({ error: "Name and email are required" });
    }

    const result = await client.query(`
      INSERT INTO ajay_table (
        emp_name, emp_email, emp_dob, emp_mobile, emp_address, emp_city,
        emp_state, emp_zipcode, emp_bank, emp_account, emp_ifsc, emp_job_role,
        emp_department, emp_experience_status, emp_company_name, emp_years_of_experience,
        emp_joining_date, emp_experience_doc, emp_ssc_doc, emp_inter_doc, emp_grad_doc, emp_terms_accepted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING id
    `, [
      req.body.emp_name,
      req.body.emp_email,
      req.body.emp_dob,
      req.body.emp_mobile,
      req.body.emp_address,
      req.body.emp_city,
      req.body.emp_state,
      req.body.emp_zipcode,
      req.body.emp_bank,
      req.body.emp_account,
      req.body.emp_ifsc,
      req.body.emp_job_role,
      req.body.emp_department,
      req.body.emp_experience_status === 'true',
      req.body.emp_company_name || null,
      req.body.emp_years_of_experience ? parseInt(req.body.emp_years_of_experience) : null,
      req.body.emp_joining_date,
      req.files["emp_experience_doc"]?.[0]?.filename || null,
      req.files["emp_ssc_doc"]?.[0]?.filename || null,
      req.files["emp_inter_doc"]?.[0]?.filename || null,
      req.files["emp_grad_doc"]?.[0]?.filename || null,
      req.body.emp_terms_accepted === 'true'
    ]);

    res.status(201).json({ 
      success: true,
      employeeId: result.rows[0].id
    });

  } catch (err) {
    cleanupFiles(req.files);
    console.error("Save employee error:", err);
    res.status(500).json({ 
      error: "Database error",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get all employees
app.get("/employees", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ajay_table");
    const employees = result.rows.map(emp => ({
      ...emp,
      emp_experience_doc: emp.emp_experience_doc ? `${req.protocol}://${req.get('host')}/uploads/${emp.emp_experience_doc}` : null,
      emp_ssc_doc: emp.emp_ssc_doc ? `${req.protocol}://${req.get('host')}/uploads/${emp.emp_ssc_doc}` : null,
      emp_inter_doc: emp.emp_inter_doc ? `${req.protocol}://${req.get('host')}/uploads/${emp.emp_inter_doc}` : null,
      emp_grad_doc: emp.emp_grad_doc ? `${req.protocol}://${req.get('host')}/uploads/${emp.emp_grad_doc}` : null
    }));
    res.json(employees);
  } catch (error) {
    console.error("Fetch employees error:", error);
    res.status(500).json({ error: "Database error" });
  }
});
// Add these endpoints to your existing server code

// Download single document
app.post("/download", async (req, res) => {
    try {
      const { empEmail, docField } = req.body;
      const validFields = ['emp_experience_doc', 'emp_ssc_doc', 'emp_inter_doc', 'emp_grad_doc'];
  
      if (!empEmail || !validFields.includes(docField)) {
        return res.status(400).json({ error: "Invalid request parameters" });
      }
  
      const result = await client.query(
        "SELECT * FROM ajay_table WHERE emp_email = $1", 
        [empEmail]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Employee not found" });
      }
  
      const filename = result.rows[0][docField];
      if (!filename) {
        return res.status(404).json({ error: "Document not found for this employee" });
      }
  
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File missing on server" });
      }
  
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
  
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Server error during download" });
    }
  });
  
  // Download all documents as zip
  app.post("/download-all", async (req, res) => {
    try {
      const { empEmail } = req.body;
      if (!empEmail) {
        return res.status(400).json({ error: "Employee email is required" });
      }
  
      const result = await client.query(
        "SELECT * FROM ajay_table WHERE emp_email = $1", 
        [empEmail]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Employee not found" });
      }
  
      const employee = result.rows[0];
      const zip = new AdmZip();
      let fileCount = 0;
  
      const docFields = [
        'emp_experience_doc', 'emp_ssc_doc', 
        'emp_inter_doc', 'emp_grad_doc'
      ];
      
      docFields.forEach(field => {
        if (employee[field]) {
          const filePath = path.join(uploadDir, employee[field]);
          if (fs.existsSync(filePath)) {
            zip.addLocalFile(filePath);
            fileCount++;
          }
        }
      });
  
      if (fileCount === 0) {
        return res.status(404).json({ error: "No documents found for this employee" });
      }
  
      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${empEmail}-documents.zip"`);
      res.send(zipBuffer);
  
    } catch (error) {
      console.error("Download all error:", error);
      res.status(500).json({ error: "Server error while creating zip file" });
    }
  });

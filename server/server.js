require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const xml2js = require("xml2js");
const mysql = require("mysql2/promise");
const cron = require("node-cron");
const PDFDocument = require('pdfkit');
const app = express();
app.use(cors());
app.use(express.json());

const makeRequest = async (url) => {
  try {
    console.log("Making request to:", url);
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      },
    });

    if (response.status === 200) {
      return response;
    }

    throw new Error(`Request failed with status: ${response.status}`);
  } catch (error) {
    console.error("Request failed:", error.message);
    throw error;
  }
};

// Database connection function
const getConnection = async () => {
  try {
    return await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
  } catch {
    console.log("Can't create connection with SQL");
  }
};
// Get all feeds
app.get("/api/feeds/fetch", async (req, res) => {
  let connection;
  try {
    console.log("Fetching Inventory");
    connection = await getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM feed_urls ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch feeds" });
  } finally {
    if (connection) await connection.end();
  }
});

// Add new feed
// Add or update feed
app.post("/api/feeds", async (req, res) => {
  const { url } = req.body;
  let connection;
  let responseHasSent = false;

  const sendResponse = (statusCode, data) => {
    if (!responseHasSent) {
      responseHasSent = true;
      return res.status(statusCode).json(data);
    }
    console.warn("Attempted to send multiple responses");
  };

  try {
    connection = await getConnection();
    console.log("Connection achieved");

    // Check if URL already exists
    const [existingFeeds] = await connection.execute(
      "SELECT id FROM feed_urls WHERE url = ?",
      [url]
    );

    let feedId;

    if (existingFeeds.length > 0) {
      // URL exists, update status to processing
      feedId = existingFeeds[0].id;
      await connection.execute(
        "UPDATE feed_urls SET status = ?, error_message = NULL WHERE id = ?",
        ["processing", feedId]
      );

      // Clear existing inventory for this feed
      await connection.execute("DELETE FROM inventory WHERE feed_url_id = ?", [
        feedId,
      ]);
    } else {
      // New URL, insert new record
      const [result] = await connection.execute(
        "INSERT INTO feed_urls (url, status) VALUES (?, ?)",
        [url, "processing"]
      );
      feedId = result.insertId;
    }

    console.log("Feed ID:", feedId);

 
    try {
      console.log("Making Request");
      const response = await makeRequest(url);
      console.log("REQ SUCCESSFUL");

      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: false,
      });

      const parsed = await parser.parseStringPromise(response.data);

      if (!parsed.account || !parsed.account.locations) {
        throw new Error("Invalid XML format: Missing required data structure");
      }

      // Handle multiple locations
      const locations = Array.isArray(parsed.account.locations.location)
        ? parsed.account.locations.location
        : [parsed.account.locations.location];

      console.log(`Found ${locations.length} locations to process`);

      // Process each location
      for (const location of locations) {
        if (!location.units || !location.units.unit) {
          console.log(`Skipping location ${location.name}: No units found`);
          continue;
        }

        // Get units for this location
        const units = Array.isArray(location.units.unit)
          ? location.units.unit
          : [location.units.unit];

        console.log(
          `Processing ${units.length} units for location: ${location.name}`
        );

        // Insert units for this location
        for (const unit of units) {
          const [inventoryResult] = await connection.execute(
            `INSERT INTO inventory (
              feed_url_id, stock_number, description, manufacturer, 
              condition_type, make, model, year, product_type, 
              status, msrp, sale_price, location, item_detail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              feedId,
              unit.stockNumber || null,
              unit.description || null,
              unit.manufacturer || null,
              unit.isNew === "true" ? "New" : "Used",
              unit.make || null,
              unit.model || null,
              unit.year || null,
              unit.productType || null,
              unit.status || "Available",
              unit.prices?.msrp || null,
              unit.prices?.sales || null,
              location.name || null,
              unit.itemDetailUrl || null,
            ].map((value) => (value === undefined ? null : value))
          );

          // Get the inserted inventory ID
          const inventoryId = inventoryResult.insertId;

          // Handle assets more robustly
          if (unit.assets && unit.assets.asset) {
            const assets = Array.isArray(unit.assets.asset)
              ? unit.assets.asset
              : [unit.assets.asset];

            for (const asset of assets) {
              if (asset && asset.url) {
                await connection.execute(
                  `INSERT INTO inventory_assets (inventory_id, url) VALUES (?, ?)`,
                  [inventoryId, asset.url]
                );
              }
            }
          }
        }
      }

      // Update status to success
      await connection.execute("UPDATE feed_urls SET status = ? WHERE id = ?", [
        "ready",
        feedId,
      ]);

      return sendResponse(200, {
        id: feedId,
        status: "ready",
      });
    } catch (processError) {
      let errorMessage = "Failed to process feed";
      console.error("Full error details:", processError);

      if (processError.code === "ECONNREFUSED") {
        errorMessage = "Could not connect to feed URL - all proxies failed";
      } else if (processError.code === "ETIMEDOUT") {
        errorMessage = "Connection timed out - proxy response too slow";
      } else if (processError.response) {
        errorMessage = `Error ${processError.response.status}: ${processError.response.statusText}`;
      } else if (processError.message) {
        errorMessage = processError.message;
      }

      console.log("Setting error message:", errorMessage);

      await connection.execute(
        "UPDATE feed_urls SET status = ?, error_message = ? WHERE id = ?",
        ["failed", errorMessage, feedId]
      );

      return sendResponse(200, {
        id: feedId,
        status: "failed",
        error: errorMessage,
      });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return sendResponse(500, { error: "Failed to add feed" });
  } finally {
    if (connection) await connection.end();
  }
});



app.get("/api/inventory/:feedId/export/pdf", async (req, res) => {
  const { feedId } = req.params;
  let connection;

  try {
    connection = await getConnection();
    const [inventoryRows] = await connection.execute(
      `SELECT 
        i.stock_number,
        i.description,
        i.manufacturer,
        i.condition_type,
        i.make,
        i.model,
        i.year,
        i.product_type,
        i.status,
        i.msrp,
        i.sale_price,
        i.location,
        i.item_detail_url,
        GROUP_CONCAT(ia.url) as asset_urls
      FROM inventory i
      LEFT JOIN inventory_assets ia ON i.id = ia.inventory_id
      WHERE i.feed_url_id = ?
      GROUP BY i.id`,
      [feedId]
    );

    if (inventoryRows.length === 0) {
      return res.status(404).json({ error: "No inventory found" });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_${feedId}_${Date.now()}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text('Inventory Report', { align: 'center' });
    doc.moveDown();

    // Add date
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();

    // Add summary
    doc.fontSize(14).text('Summary');
    doc.fontSize(12);
    doc.text(`Total Items: ${inventoryRows.length}`);
    const newItems = inventoryRows.filter(item => item.condition_type === 'New').length;
    const usedItems = inventoryRows.filter(item => item.condition_type === 'Used').length;
    doc.text(`New Items: ${newItems}`);
    doc.text(`Used Items: ${usedItems}`);
    doc.moveDown();

    // Table headers
    const headers = [
      'Stock #',
      'Description',
      'Manufacturer',
      'Condition',
      'Make',
      'Model',
      'Year',
      'Type',
      'Status',
      'MSRP',
      'Sale Price',
      'Location'
    ];

    // Define column widths (adjust as needed)
    const colWidth = (doc.page.width - 100) / headers.length;
    let startX = 50;
    let startY = doc.y;

    // Draw headers
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, startX + (i * colWidth), startY, {
        width: colWidth,
        align: 'left'
      });
    });

    // Draw header line
    startY += 20;
    doc.moveTo(50, startY).lineTo(doc.page.width - 50, startY).stroke();
    startY += 10;

    // Draw rows
    doc.fontSize(9).font('Helvetica');
    inventoryRows.forEach((item, rowIndex) => {
    
      if (startY > doc.page.height - 120) {  
     
        doc.addPage();
        startY = 50;
        
      
        doc.fontSize(10).font('Helvetica-Bold');
        headers.forEach((header, i) => {
          doc.text(header, startX + (i * colWidth), startY, {
            width: colWidth,
            align: 'left'
          });
        });
        startY += 20;
        doc.moveTo(50, startY).lineTo(doc.page.width - 50, startY).stroke();
        startY += 10;
        doc.fontSize(9).font('Helvetica');
      }

      // Draw row data
      const rowData = [
        item.stock_number || '',
        (item.description || '').substring(0, 30), // Truncate long descriptions
        item.manufacturer || '',
        item.condition_type || '',
        item.make || '',
        item.model || '',
        item.year || '',
        item.product_type || '',
        item.status || '',
        item.msrp || '',
        item.sale_price || '',
        item.location || ''
      ];

      rowData.forEach((text, i) => {
        doc.text(text.toString(), startX + (i * colWidth), startY, {
          width: colWidth,
          align: 'left'
        });
      });
      
      // Move to next row - increased from 25 to 35 for more height
      startY += 35;  // Increase this value for taller rows
      
      // Add subtle line between rows - adjusted the spacing accordingly
      doc.strokeColor('#cccccc')
        .moveTo(50, startY - 8)  // Adjusted from -5 to -8 to maintain proper spacing
        .lineTo(doc.page.width - 50, startY - 8)
        .stroke();
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error("Error exporting inventory to PDF:", error);
    res.status(500).json({ error: "Failed to export inventory to PDF" });
  } finally {
    if (connection) await connection.end();
  }
});


// Add this endpoint to your server.js
app.get("/api/inventory/:feedId/export/csv", async (req, res) => {
  const { feedId } = req.params;
  let connection;

  try {
    connection = await getConnection();
    const [inventoryRows] = await connection.execute(
      `SELECT 
        i.stock_number,
        i.description,
        i.manufacturer,
        i.condition_type,
        i.make,
        i.model,
        i.year,
        i.product_type,
        i.status,
        i.msrp,
        i.sale_price,
        i.location,
        i.item_detail_url
      FROM inventory i
      WHERE i.feed_url_id = ?`,
      [feedId]
    );

    if (inventoryRows.length === 0) {
      return res.status(404).json({ error: "No inventory found" });
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_${feedId}_${Date.now()}.csv`);

    // Write CSV header
    const header = Object.keys(inventoryRows[0]).join(',') + '\n';
    res.write(header);

    // Write each row
    inventoryRows.forEach(row => {
      const values = Object.values(row).map(value => {
        // Handle null values and escape commas
        if (value === null || value === undefined) return '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      res.write(values.join(',') + '\n');
    });

    res.end();
  } catch (error) {
    console.error("Error exporting inventory to CSV:", error);
    res.status(500).json({ error: "Failed to export inventory to CSV" });
  } finally {
    if (connection) await connection.end();
  }
});



const processFeed = async (connection, feedId, url) => {
  try {
    const response = await makeRequest(url);
    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      normalizeTags: false,
    });

    const parsed = await parser.parseStringPromise(response.data);

    if (!parsed.account || !parsed.account.locations) {
      throw new Error("Invalid XML format: Missing required data structure");
    }

    // Clear existing inventory
    await connection.execute("DELETE FROM inventory WHERE feed_url_id = ?", [
      feedId,
    ]);

    const locations = Array.isArray(parsed.account.locations.location)
      ? parsed.account.locations.location
      : [parsed.account.locations.location];

    for (const location of locations) {
      if (!location.units || !location.units.unit) continue;

      const units = Array.isArray(location.units.unit)
        ? location.units.unit
        : [location.units.unit];
      console.log(
        `Processing ${units.length} units for location: ${location.name}`
      );
      for (const unit of units) {
        const [inventoryResult] = await connection.execute(
          `INSERT INTO inventory (
            feed_url_id, stock_number, description, manufacturer, 
            condition_type, make, model, year, product_type, 
            status, msrp, sale_price, location, item_detail_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            feedId,
            unit.stockNumber || null,
            unit.description || null,
            unit.manufacturer || null,
            unit.isNew === "true" ? "New" : "Used",
            unit.make || null,
            unit.model || null,
            unit.year || null,
            unit.productType || null,
            unit.status || "Available",
            unit.prices?.msrp || null,
            unit.prices?.sales || null,
            location.name || null,
            unit.itemDetailUrl || null,
          ].map((value) => (value === undefined ? null : value))
        );

        const inventoryId = inventoryResult.insertId;

        if (unit.assets && unit.assets.asset) {
          const assets = Array.isArray(unit.assets.asset)
            ? unit.assets.asset
            : [unit.assets.asset];

          for (const asset of assets) {
            if (asset && asset.url) {
              await connection.execute(
                `INSERT INTO inventory_assets (inventory_id, url) VALUES (?, ?)`,
                [inventoryId, asset.url]
              );
            }
          }
        }
      }
    }

    await connection.execute(
      "UPDATE feed_urls SET status = ?, last_updated = NOW() WHERE id = ?",
      ["ready", feedId]
    );

    return true;
  } catch (error) {
    let errorMessage = "Failed to process feed";
    if (error.code === "ECONNREFUSED") {
      errorMessage = "Could not connect to feed URL";
    } else if (error.code === "ETIMEDOUT") {
      errorMessage = "Connection timed out";
    } else if (error.message) {
      errorMessage = error.message;
    }

    await connection.execute(
      "UPDATE feed_urls SET status = ?, error_message = ? WHERE id = ?",
      ["failed", errorMessage, feedId]
    );

    throw error;
  }
};

app.post("/api/feeds/:id/update", async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();

    // Get the feed URL
    const [rows] = await connection.execute(
      "SELECT url FROM feed_urls WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Feed not found" });
    }

    // Update status to processing
    await connection.execute("UPDATE feed_urls SET status = ? WHERE id = ?", [
      "processing",
      id,
    ]);

    // Process the feed
    await processFeed(connection, id, rows[0].url);

    res.json({ status: "success" });
  } catch (error) {
    console.error("Error updating feed:", error);
    res.status(500).json({ error: "Failed to update feed" });
  } finally {
    if (connection) await connection.end();
  }
});

// Simplified auto update settings endpoint - just toggle on/off
app.post("/api/feeds/:id/auto-update", async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  let connection;

  try {
    connection = await getConnection();


    await connection.execute(
      "UPDATE feed_urls SET auto_update = ? WHERE id = ?",
      [enabled, id]
    );

    res.json({ status: "success", auto_update: enabled });
  } catch (error) {
    console.error("Error updating auto-update settings:", error);
    res.status(500).json({ error: "Failed to update auto-update settings" });
  } finally {
    if (connection) await connection.end();
  }
});
// Retry feed
app.post("/api/feeds/:id/retry", async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();

    // Get the URL
    const [rows] = await connection.execute(
      "SELECT url FROM feed_urls WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Feed not found" });
    }

    const url = rows[0].url;

    // Update status to processing
    await connection.execute(
      "UPDATE feed_urls SET status = ?, error_message = NULL WHERE id = ?",
      ["processing", id]
    );

    try {
      const response = await makeRequest(url);
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: true,
      });

      const parsed = await parser.parseStringPromise(response.data);

      if (!parsed.inventory || !parsed.inventory.unit) {
        throw new Error("Invalid XML format: Missing inventory data");
      }

      await connection.execute("DELETE FROM inventory WHERE feed_url_id = ?", [
        id,
      ]);

      const items = Array.isArray(parsed.inventory.unit)
        ? parsed.inventory.unit
        : [parsed.inventory.unit];

      for (const item of items) {
        await connection.execute(
          `INSERT INTO inventory (
            feed_url_id, stock_number, description, manufacturer, 
            condition_type, make, model, year, product_type, 
            status, msrp, sale_price, location,item_detail_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.stock || null,
            item.description || null,
            item.manufacturer || null,
            item.condition || "New",
            item.make || null,
            item.model || null,
            item.year || null,
            item.type || null,
            item.status || "Available",
            item.msrp || null,
            item.price || null,
            item.location || null,
          ]
        );
      }

      // Update status to success
      await connection.execute("UPDATE feed_urls SET status = ? WHERE id = ?", [
        "ready",
        id,
      ]);

      res.json({ status: "ready" });
    } catch (processError) {
      let errorMessage = "Failed to process feed";

      if (processError.code === "ECONNREFUSED") {
        errorMessage = "Could not connect to feed URL";
      } else if (processError.code === "ETIMEDOUT") {
        errorMessage = "Connection timed out";
      } else if (processError.response) {
        errorMessage = `Error ${processError.response.status}: ${processError.response.statusText}`;
      }

      await connection.execute(
        "UPDATE feed_urls SET status = ?, error_message = ? WHERE id = ?",
        ["failed", errorMessage, id]
      );

      res.json({ status: "failed", error: errorMessage });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to retry feed" });
  } finally {
    if (connection) await connection.end();
  }
});

const processAutoUpdates = async () => {
  let connection;
  try {
    connection = await getConnection();

    // Get all feeds with auto_update enabled
    const [feeds] = await connection.execute(
      "SELECT id, url FROM feed_urls WHERE auto_update = true AND status != 'processing'"
    );

    console.log(`Found ${feeds.length} feeds with auto-update enabled`);

    // Process each feed
    for (const feed of feeds) {
      try {
        // Update status to processing
        await connection.execute(
          "UPDATE feed_urls SET status = ? WHERE id = ?",
          ["processing", feed.id]
        );

        // Process the feed
        await processFeed(connection, feed.id, feed.url);

        console.log(`Auto-updated feed ${feed.id} successfully`);
      } catch (error) {
        console.error(`Error auto-updating feed ${feed.id}:`, error);
        // Error handling is already done in processFeed function
      }
    }
  } catch (error) {
    console.error("Error in auto-update process:", error);
  } finally {
    if (connection) await connection.end();
  }
};
app.get("/api/inventory/:feedId/json", async (req, res) => {
  const { feedId } = req.params;
  let connection;

  try {
    connection = await getConnection();
    const [inventoryRows] = await connection.execute(
      `SELECT i.*, ia.url 
       FROM inventory i 
       LEFT JOIN inventory_assets ia ON i.id = ia.inventory_id 
       WHERE i.feed_url_id = ?`,
      [feedId]
    );

    // Group inventory items and their assets
    const inventory = inventoryRows.reduce((acc, row) => {
      const existingItem = acc.find((item) => item.id === row.id);
      if (existingItem) {
        if (row.url && !existingItem.images.includes(row.url)) {
          existingItem.images.push(row.url);
        }
      } else {
        acc.push({
          id: row.id,
          stock_number: row.stock_number,
          description: row.description,
          manufacturer: row.manufacturer,
          condition_type: row.condition_type,
          make: row.make,
          model: row.model,
          year: row.year,
          product_type: row.product_type,
          status: row.status,
          msrp: row.msrp,
          sale_price: row.sale_price,
          location: row.location,
          item_detail_url: row.item_detail_url,
          images: row.url ? [row.url] : [],
          created_at: row.created_at,
          feed_url_id: row.feed_url_id,
        });
      }
      return acc;
    }, []);

    res.json({
      total_items: inventory.length,
      inventory: inventory,
    });
  } catch (error) {
    console.error("Error fetching inventory json:", error);
    res.status(500).json({ error: "Failed to fetch inventory data" });
  } finally {
    if (connection) await connection.end();
  }
});
app.get("/api/inventory/:feedId", async (req, res) => {
  const { feedId } = req.params;
  console.log("Fetching inventory for feedId:", feedId);
  let connection;

  try {
    connection = await getConnection();
    const [inventoryRows] = await connection.execute(
      "SELECT i.*, ia.url, ia.id as asset_id FROM inventory i  LEFT JOIN inventory_assets ia ON i.id = ia.inventory_id  WHERE i.feed_url_id = ?",
      [feedId]
    );

    // Group inventory items by their id, and collect all associated asset URLs
    const inventory = inventoryRows.reduce((acc, row) => {
      const existingItem = acc.find((item) => item.id === row.id);
      if (existingItem) {
        existingItem.asset_urls.push(row.url);
        existingItem.asset_ids.push(row.asset_id);
      } else {
        acc.push({
          id: row.id,
          stock_number: row.stock_number,
          description: row.description,
          manufacturer: row.manufacturer,
          condition_type: row.condition_type,
          make: row.make,
          model: row.model,
          year: row.year,
          product_type: row.product_type,
          status: row.status,
          msrp: row.msrp,
          item_detail_url: row.item_detail_url,
          sale_price: row.sale_price,
          location: row.location,
          created_at: row.created_at,
          feed_url_id: row.feed_url_id,
          asset_urls: [row.url],
          asset_ids: [row.asset_id],
        });
      }
      return acc;
    }, []);

    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Failed to fetch inventory" });
  } finally {
    if (connection) await connection.end();
  }
});

// Get dashboard stats
app.get("/api/dashboard", async (req, res) => {
  let connection;
  console.log("Hello from Dashboard");

  try {
    connection = await getConnection();
    console.log("Hello from Dashboard1");

    // Get total counts and values
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_units,
        SUM(CASE WHEN condition_type = 'New' THEN 1 ELSE 0 END) as new_units,
        SUM(CASE WHEN condition_type = 'Used' THEN 1 ELSE 0 END) as used_units,
        AVG(CAST(REPLACE(REPLACE(sale_price, '("/api/feeds/:id", async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();
    
    // Delete inventory first due to foreign key
    await connection.execute(
      "DELETE FROM inventory WHERE feed_url_id = ?",
      [id]
    );

    // Then delete the feed
    await connection.execute(
      "DELETE FROM feed_urls WHERE id = ?",
      [id]
    );

    res.json({ message: "Feed deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete feed" });
  } finally {
    if (connection) await connection.end();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
});, ''), ',', '') AS DECIMAL(10,2))) as avg_price,
        SUM(CAST(REPLACE(REPLACE(sale_price, '("/api/feeds/:id", async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();
    
    // Delete inventory first due to foreign key
    await connection.execute(
      "DELETE FROM inventory WHERE feed_url_id = ?",
      [id]
    );

    // Then delete the feed
    await connection.execute(
      "DELETE FROM feed_urls WHERE id = ?",
      [id]
    );

    res.json({ message: "Feed deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete feed" });
  } finally {
    if (connection) await connection.end();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
});, ''), ',', '') AS DECIMAL(10,2))) as total_value
      FROM inventory
    `);

    // Get active feeds count
    const [feeds] = await connection.execute(
      'SELECT COUNT(*) as active_feeds FROM feed_urls WHERE status = "ready"'
    );

    // Get recent items
    const [recentItems] = await connection.execute(
      "SELECT * FROM inventory ORDER BY id DESC LIMIT 5"
    );

    res.json({
      stats: stats[0],
      activeFeeds: feeds[0].active_feeds,
      recentItems,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  } finally {
    if (connection) await connection.end();
  }
});

// Get single inventory item
app.get("/api/inventory/:feedId/:stockNumber", async (req, res) => {
  const { feedId, stockNumber } = req.params;
  let connection;

  try {
    connection = await getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM inventory WHERE feed_url_id = ? AND stock_number = ?",
      [feedId, stockNumber]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch inventory item" });
  } finally {
    if (connection) await connection.end();
  }
});

// Delete feed
app.delete("/api/feeds/:id", async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();

    // Delete inventory first due to foreign key
    await connection.execute("DELETE FROM inventory WHERE feed_url_id = ?", [
      id,
    ]);

    // Then delete the feed
    await connection.execute("DELETE FROM feed_urls WHERE id = ?", [id]);

    res.json({ message: "Feed deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete feed" });
  } finally {
    if (connection) await connection.end();
  }
});
cron.schedule("* */12 * * *", () => {
  console.log("Running auto-update cron job");
  processAutoUpdates();
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

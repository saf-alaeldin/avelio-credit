const PDFDocument = require('pdfkit');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

function formatCurrency(amount, currency = 'USD') {
  const n = isFinite(parseFloat(amount)) ? parseFloat(amount) : 0;
  const head = currency === 'USD' ? '$' : currency === 'SSP' ? 'SSP ' : `${currency} `;
  return `${head}${n.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

function formatDate(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Generate comprehensive sales and settlements report
 * @param {Object} data - Report data
 * @param {Array} data.sales - Station sales data
 * @param {Array} data.settlements - Settlement data
 * @param {Object} data.analytics - Analytics and insights
 * @param {String} data.period - 'daily', 'weekly', 'monthly'
 * @param {String} data.periodLabel - Display label
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateSalesSettlementsReport({
  sales = [],
  settlements = [],
  analytics = {},
  period = 'monthly',
  periodLabel = ''
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Color palette
      const PRIMARY = '#0EA5E9';
      const PRIMARY_DARK = '#0284C7';
      const ACCENT = '#10B981';
      const TEXT = '#1F2937';
      const MUTED = '#6B7280';
      const LIGHT_BG = '#F9FAFB';
      const WARNING = '#F59E0B';
      const DANGER = '#EF4444';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let currentY = doc.page.margins.top;

      // ==================== PAGE 1: EXECUTIVE SUMMARY ====================

      // Top border
      doc.rect(0, 0, doc.page.width, 4).fill(PRIMARY);

      // Header
      currentY += 10;
      doc.fontSize(28).font('Helvetica-Bold').fillColor(TEXT)
         .text('Sales & Settlements Report', doc.page.margins.left, currentY);

      currentY += 35;
      doc.fontSize(12).font('Helvetica').fillColor(MUTED)
         .text(`Period: ${periodLabel}`, doc.page.margins.left);

      currentY += 15;
      doc.text(`Generated: ${formatDate(new Date())}`, doc.page.margins.left);

      currentY += 30;

      // Executive Summary Section
      doc.fontSize(16).font('Helvetica-Bold').fillColor(TEXT)
         .text('Executive Summary', doc.page.margins.left, currentY);

      currentY += 25;

      // Summary cards (2x2 grid)
      const cardWidth = (pageWidth - 20) / 2;
      const cardHeight = 70;

      // Card 1: Total Sales
      doc.roundedRect(doc.page.margins.left, currentY, cardWidth, cardHeight, 5)
         .fillAndStroke(LIGHT_BG, PRIMARY);
      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text('TOTAL SALES', doc.page.margins.left + 15, currentY + 15);
      doc.fontSize(24).font('Helvetica-Bold').fillColor(PRIMARY)
         .text(analytics.totalSales || 0, doc.page.margins.left + 15, currentY + 30);
      doc.fontSize(9).fillColor(MUTED)
         .text(`${formatCurrency(analytics.totalRevenue || 0, 'USD')}`, doc.page.margins.left + 15, currentY + 55);

      // Card 2: Total Settlements
      doc.roundedRect(doc.page.margins.left + cardWidth + 20, currentY, cardWidth, cardHeight, 5)
         .fillAndStroke(LIGHT_BG, ACCENT);
      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text('SETTLEMENTS', doc.page.margins.left + cardWidth + 35, currentY + 15);
      doc.fontSize(24).font('Helvetica-Bold').fillColor(ACCENT)
         .text(analytics.totalSettlements || 0, doc.page.margins.left + cardWidth + 35, currentY + 30);
      doc.fontSize(9).fillColor(MUTED)
         .text(`${analytics.settlementsApproved || 0} Approved`, doc.page.margins.left + cardWidth + 35, currentY + 55);

      currentY += cardHeight + 20;

      // Card 3: Active Stations
      doc.roundedRect(doc.page.margins.left, currentY, cardWidth, cardHeight, 5)
         .fillAndStroke(LIGHT_BG, WARNING);
      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text('ACTIVE STATIONS', doc.page.margins.left + 15, currentY + 15);
      doc.fontSize(24).font('Helvetica-Bold').fillColor(WARNING)
         .text(analytics.activeStations || 0, doc.page.margins.left + 15, currentY + 30);
      doc.fontSize(9).fillColor(MUTED)
         .text(`${analytics.activeAgents || 0} Agents`, doc.page.margins.left + 15, currentY + 55);

      // Card 4: Average Transaction
      doc.roundedRect(doc.page.margins.left + cardWidth + 20, currentY, cardWidth, cardHeight, 5)
         .fillAndStroke(LIGHT_BG, PRIMARY_DARK);
      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text('AVG TRANSACTION', doc.page.margins.left + cardWidth + 35, currentY + 15);
      doc.fontSize(20).font('Helvetica-Bold').fillColor(PRIMARY_DARK)
         .text(formatCurrency(analytics.avgTransaction || 0, 'USD'), doc.page.margins.left + cardWidth + 35, currentY + 32);

      currentY += cardHeight + 30;

      // Revenue Breakdown by Currency
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Revenue by Currency', doc.page.margins.left, currentY);

      currentY += 20;

      if (analytics.byCurrency && analytics.byCurrency.length > 0) {
        analytics.byCurrency.forEach((curr, index) => {
          const barY = currentY + (index * 40);
          const barMaxWidth = pageWidth - 200;
          const percentage = (curr.total / analytics.totalRevenue) * 100;
          const barWidth = (percentage / 100) * barMaxWidth;

          // Currency label
          doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT)
             .text(curr.currency, doc.page.margins.left, barY);

          // Progress bar
          doc.roundedRect(doc.page.margins.left + 60, barY, barMaxWidth, 20, 3)
             .fillOpacity(0.1).fill(PRIMARY);
          doc.roundedRect(doc.page.margins.left + 60, barY, barWidth, 20, 3)
             .fillOpacity(1).fill(PRIMARY);

          // Amount
          doc.fontSize(10).font('Helvetica').fillColor(TEXT)
             .text(formatCurrency(curr.total, curr.currency), doc.page.margins.left + 80 + barMaxWidth, barY + 5);
        });
        currentY += (analytics.byCurrency.length * 40) + 10;
      }

      currentY += 20;

      // Sales by Station
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Performance by Station', doc.page.margins.left, currentY);

      currentY += 20;

      // Table header
      const col1X = doc.page.margins.left;
      const col2X = doc.page.margins.left + 150;
      const col3X = doc.page.margins.left + 280;
      const col4X = doc.page.margins.left + 400;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
      doc.text('STATION', col1X, currentY);
      doc.text('SALES', col2X, currentY);
      doc.text('REVENUE', col3X, currentY);
      doc.text('AGENTS', col4X, currentY);

      currentY += 15;
      doc.strokeColor(LIGHT_BG).lineWidth(1)
         .moveTo(doc.page.margins.left, currentY)
         .lineTo(doc.page.margins.left + pageWidth, currentY)
         .stroke();

      currentY += 10;

      // Table rows
      if (analytics.byStation && analytics.byStation.length > 0) {
        analytics.byStation.slice(0, 6).forEach((station, index) => {
          const rowY = currentY + (index * 25);

          doc.fontSize(10).font('Helvetica').fillColor(TEXT);
          doc.text(station.station_name || station.station_code, col1X, rowY);
          doc.text(station.sales_count || 0, col2X, rowY);
          doc.text(formatCurrency(station.total_amount || 0, 'USD'), col3X, rowY);
          doc.text(station.agent_count || 0, col4X, rowY);
        });
        currentY += (Math.min(analytics.byStation.length, 6) * 25);
      }

      // ==================== PAGE 2: DETAILED INSIGHTS ====================
      doc.addPage();
      currentY = doc.page.margins.top + 20;

      // Page title
      doc.fontSize(18).font('Helvetica-Bold').fillColor(TEXT)
         .text('Detailed Insights & Analytics', doc.page.margins.left, currentY);

      currentY += 30;

      // Settlement Status Breakdown
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Settlement Status', doc.page.margins.left, currentY);

      currentY += 20;

      if (analytics.settlementStatus) {
        const statusData = [
          { label: 'Draft', count: analytics.settlementStatus.draft || 0, color: MUTED },
          { label: 'Submitted', count: analytics.settlementStatus.submitted || 0, color: WARNING },
          { label: 'Approved', count: analytics.settlementStatus.approved || 0, color: ACCENT },
          { label: 'Rejected', count: analytics.settlementStatus.rejected || 0, color: DANGER }
        ];

        statusData.forEach((status, index) => {
          const boxY = currentY + (index * 35);

          // Color box
          doc.roundedRect(doc.page.margins.left, boxY, 60, 25, 3)
             .fill(status.color);

          // Count
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(status.count, doc.page.margins.left + 20, boxY + 6);

          // Label
          doc.fontSize(11).font('Helvetica').fillColor(TEXT)
             .text(status.label, doc.page.margins.left + 75, boxY + 7);
        });

        currentY += 150;
      }

      // Point of Sale Analysis (Juba specific)
      if (analytics.jubaPointOfSale && analytics.jubaPointOfSale.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
           .text('Juba - Point of Sale Performance', doc.page.margins.left, currentY);

        currentY += 20;

        analytics.jubaPointOfSale.forEach((pos, index) => {
          const posY = currentY + (index * 30);

          doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT)
             .text(pos.point_of_sale, doc.page.margins.left, posY);

          doc.fontSize(9).font('Helvetica').fillColor(MUTED)
             .text(`${pos.sales_count} sales • ${formatCurrency(pos.total_amount, 'USD')}`,
                   doc.page.margins.left, posY + 12);

          // Small bar
          const barWidth = (pos.sales_count / analytics.totalSales) * 200;
          doc.roundedRect(doc.page.margins.left + 250, posY + 8, barWidth, 8, 2)
             .fill(PRIMARY);
        });

        currentY += (analytics.jubaPointOfSale.length * 30) + 20;
      }

      // Top Performing Agents
      if (analytics.topAgents && analytics.topAgents.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
           .text('Top Performing Agents', doc.page.margins.left, currentY);

        currentY += 20;

        // Table header
        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
        doc.text('AGENT', doc.page.margins.left, currentY);
        doc.text('STATION', doc.page.margins.left + 180, currentY);
        doc.text('SALES', doc.page.margins.left + 280, currentY);
        doc.text('REVENUE', doc.page.margins.left + 360, currentY);

        currentY += 15;
        doc.strokeColor(LIGHT_BG).lineWidth(1)
           .moveTo(doc.page.margins.left, currentY)
           .lineTo(doc.page.margins.left + pageWidth, currentY)
           .stroke();

        currentY += 10;

        analytics.topAgents.slice(0, 8).forEach((agent, index) => {
          const rowY = currentY + (index * 22);

          doc.fontSize(9).font('Helvetica').fillColor(TEXT);
          doc.text(agent.agent_name, doc.page.margins.left, rowY, { width: 160 });
          doc.text(agent.station_code || '-', doc.page.margins.left + 180, rowY);
          doc.text(agent.sales_count, doc.page.margins.left + 280, rowY);
          doc.text(formatCurrency(agent.total_amount, 'USD'), doc.page.margins.left + 360, rowY);
        });
      }

      // Footer on all pages
      const footerY = doc.page.height - 50;
      doc.fontSize(8).font('Helvetica').fillColor(MUTED)
         .text('Kush Air - Sales & Settlements Report', doc.page.margins.left, footerY, {
           align: 'center',
           width: pageWidth
         });

      doc.fontSize(8).fillColor(MUTED)
         .text(`Page 2 of 2`, doc.page.margins.left, footerY + 12, {
           align: 'center',
           width: pageWidth
         });

      doc.end();

    } catch (error) {
      logger.error('Sales & Settlements Report PDF generation error:', error);
      reject(error);
    }
  });
}

module.exports = {
  generateSalesSettlementsReport
};

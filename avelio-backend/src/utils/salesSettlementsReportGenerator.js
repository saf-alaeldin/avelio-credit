const PDFDocument = require('pdfkit');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

function formatCurrency(amount, currency = 'USD') {
  const n = isFinite(parseFloat(amount)) ? parseFloat(amount) : 0;
  const head = currency === 'USD' ? '$' : currency === 'SSP' ? 'SSP ' : `${currency} `;
  return `${head}${n.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

function formatNumber(num) {
  return (num || 0).toLocaleString();
}

function formatDate(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
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
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Color palette
      const PRIMARY = '#074973';
      const PRIMARY_LIGHT = '#0EA5E9';
      const ACCENT = '#10B981';
      const TEXT = '#1F2937';
      const MUTED = '#6B7280';
      const LIGHT_BG = '#F8FAFC';
      const WARNING = '#F59E0B';
      const DANGER = '#EF4444';
      const WHITE = '#FFFFFF';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;
      let y = doc.page.margins.top;

      // Use HQ Settlement summaries (same as Station Summary page)
      const hqSummaries = analytics.hqSummaries || {};
      const usdSummary = hqSummaries['USD'] || { opening_balance: 0, cash_from_stations: 0, total_available: 0, total_hq_expenses: 0, safe_amount: 0 };
      const sspSummary = hqSummaries['SSP'] || { opening_balance: 0, cash_from_stations: 0, total_available: 0, total_hq_expenses: 0, safe_amount: 0 };

      // ==================== PAGE 1: EXECUTIVE SUMMARY ====================

      // Header with logo
      const logoPath = path.join(__dirname, '../assets/logo.png');
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, leftX, y, { height: 40 });
        } catch (e) {
          doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY)
             .text('KUSH AIR', leftX, y + 10);
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY)
           .text('KUSH AIR', leftX, y + 10);
      }

      // Report title - positioned on right side
      doc.fontSize(20).font('Helvetica-Bold').fillColor(TEXT)
         .text('Sales & Settlements Report', leftX, y + 5, { width: pageWidth, align: 'right', lineBreak: false });

      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text(periodLabel, leftX, y + 30, { width: pageWidth, align: 'right', lineBreak: false });

      y += 55;

      // Divider line
      doc.strokeColor(PRIMARY).lineWidth(2)
         .moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();

      y += 20;

      // Key Performance Indicators
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Key Performance Indicators', leftX, y);

      y += 20;

      // KPI Cards - Row 1
      const kpiWidth = (pageWidth - 30) / 4;
      const kpiHeight = 60;

      const kpis = [
        { label: 'Total Sales', value: formatNumber(analytics.totalSales || 0), color: PRIMARY },
        { label: 'Settlements', value: formatNumber(analytics.totalSettlements || 0), color: ACCENT },
        { label: 'Active Stations', value: formatNumber(analytics.activeStations || 0), color: WARNING },
        { label: 'Active Agents', value: formatNumber(analytics.activeAgents || 0), color: PRIMARY_LIGHT }
      ];

      kpis.forEach((kpi, i) => {
        const kpiX = leftX + (i * (kpiWidth + 10));
        doc.roundedRect(kpiX, y, kpiWidth, kpiHeight, 4).fill(LIGHT_BG);
        doc.roundedRect(kpiX, y, 4, kpiHeight, 2).fill(kpi.color);

        doc.fontSize(9).font('Helvetica').fillColor(MUTED)
           .text(kpi.label, kpiX + 12, y + 12);
        doc.fontSize(18).font('Helvetica-Bold').fillColor(kpi.color)
           .text(kpi.value, kpiX + 12, y + 28);
      });

      y += kpiHeight + 25;

      // Revenue Summary Section
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Revenue Summary', leftX, y);

      y += 20;

      // Revenue by currency
      const halfWidth = (pageWidth - 15) / 2;

      // USD Box
      doc.roundedRect(leftX, y, halfWidth, 75, 4).fill('#ECFDF5');
      doc.roundedRect(leftX, y, halfWidth, 4, 2).fill(ACCENT);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(ACCENT)
         .text('USD Revenue', leftX + 15, y + 15);

      const usdSales = sales.filter(s => s.currency === 'USD');
      const usdTotal = usdSales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      doc.fontSize(22).font('Helvetica-Bold').fillColor(TEXT)
         .text(formatCurrency(usdTotal, 'USD'), leftX + 15, y + 32);
      doc.fontSize(9).font('Helvetica').fillColor(MUTED)
         .text(`${usdSales.length} transactions`, leftX + 15, y + 58);

      // SSP Box
      doc.roundedRect(leftX + halfWidth + 15, y, halfWidth, 75, 4).fill('#FEF3C7');
      doc.roundedRect(leftX + halfWidth + 15, y, halfWidth, 4, 2).fill(WARNING);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(WARNING)
         .text('SSP Revenue', leftX + halfWidth + 30, y + 15);

      const sspSales = sales.filter(s => s.currency === 'SSP');
      const sspTotal = sspSales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      doc.fontSize(22).font('Helvetica-Bold').fillColor(TEXT)
         .text(formatCurrency(sspTotal, 'SSP'), leftX + halfWidth + 30, y + 32);
      doc.fontSize(9).font('Helvetica').fillColor(MUTED)
         .text(`${sspSales.length} transactions`, leftX + halfWidth + 30, y + 58);

      y += 95;

      // Cash Summary (same as Station Summary page)
      doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
         .text('Cash Summary', leftX, y);

      y += 20;

      // Financial metrics table
      const finColWidths = [180, 165, 165];
      const finHeaders = ['Metric', 'USD', 'SSP'];

      // Table header
      doc.rect(leftX, y, pageWidth, 22).fill(PRIMARY);
      let finX = leftX;
      finHeaders.forEach((header, i) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(WHITE)
           .text(header, finX + 8, y + 6, { width: finColWidths[i] - 16 });
        finX += finColWidths[i];
      });

      y += 22;

      // Financial rows matching Station Summary format
      const financialRows = [
        { label: 'Opening Balance', usd: usdSummary.opening_balance, ssp: sspSummary.opening_balance, bold: false },
        { label: '+ Cash from Stations', usd: usdSummary.cash_from_stations, ssp: sspSummary.cash_from_stations, bold: false },
        { label: '= Total Available', usd: usdSummary.total_available, ssp: sspSummary.total_available, bold: true },
        { label: '- HQ Expenses', usd: usdSummary.total_hq_expenses, ssp: sspSummary.total_hq_expenses, bold: false, isExpense: true },
        { label: '= TO SAFE', usd: usdSummary.safe_amount, ssp: sspSummary.safe_amount, bold: true, highlight: true }
      ];

      financialRows.forEach((row, i) => {
        const rowY = y + (i * 24);
        const bgColor = row.highlight ? '#ECFDF5' : (i % 2 === 0 ? WHITE : LIGHT_BG);
        doc.rect(leftX, rowY, pageWidth, 24).fill(bgColor);

        finX = leftX;
        const fontWeight = row.bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(10).font(fontWeight).fillColor(TEXT)
           .text(row.label, finX + 8, rowY + 7, { width: finColWidths[0] - 16 });
        finX += finColWidths[0];

        const usdColor = row.isExpense ? DANGER : (row.highlight ? ACCENT : TEXT);
        const usdPrefix = row.isExpense ? '-' : '';
        doc.font(fontWeight).fillColor(usdColor)
           .text(usdPrefix + formatCurrency(row.usd, 'USD'), finX + 8, rowY + 7, { width: finColWidths[1] - 16 });
        finX += finColWidths[1];

        const sspColor = row.isExpense ? DANGER : (row.highlight ? ACCENT : TEXT);
        const sspPrefix = row.isExpense ? '-' : '';
        doc.font(fontWeight).fillColor(sspColor)
           .text(sspPrefix + formatCurrency(row.ssp, 'SSP'), finX + 8, rowY + 7, { width: finColWidths[2] - 16 });
      });

      y += (financialRows.length * 24) + 15;

      // ==================== PAGE 2: STATION PERFORMANCE ====================
      doc.addPage();
      y = doc.page.margins.top;

      // Page title
      doc.fontSize(18).font('Helvetica-Bold').fillColor(TEXT)
         .text('Station Performance', leftX, y);

      doc.fontSize(10).font('Helvetica').fillColor(MUTED)
         .text(`Report Period: ${periodLabel}`, leftX, y + 25);

      y += 50;

      // Station Performance Table
      if (analytics.byStation && analytics.byStation.length > 0) {
        const stationColWidths = [100, 70, 100, 100, 80];
        const stationHeaders = ['Station', 'Sales', 'Revenue (USD)', 'Revenue (SSP)', 'Agents'];

        // Table header
        doc.rect(leftX, y, pageWidth, 24).fill(PRIMARY);
        let stX = leftX;
        stationHeaders.forEach((header, i) => {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(WHITE)
             .text(header, stX + 6, y + 7, { width: stationColWidths[i] - 12 });
          stX += stationColWidths[i];
        });

        y += 24;

        // Station rows
        analytics.byStation.slice(0, 12).forEach((station, i) => {
          const rowY = y + (i * 24);
          const bgColor = i % 2 === 0 ? WHITE : LIGHT_BG;
          doc.rect(leftX, rowY, pageWidth, 24).fill(bgColor);

          // Get station-specific currency totals
          const stationSales = sales.filter(s => s.station_code === station.station_code);
          const stationUSD = stationSales.filter(s => s.currency === 'USD')
                              .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
          const stationSSP = stationSales.filter(s => s.currency === 'SSP')
                              .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

          stX = leftX;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT)
             .text(station.station_name || station.station_code, stX + 6, rowY + 7, { width: stationColWidths[0] - 12 });
          stX += stationColWidths[0];

          doc.fontSize(9).font('Helvetica').fillColor(TEXT)
             .text(formatNumber(station.sales_count || 0), stX + 6, rowY + 7);
          stX += stationColWidths[1];

          doc.text(formatCurrency(stationUSD, 'USD'), stX + 6, rowY + 7);
          stX += stationColWidths[2];

          doc.text(formatCurrency(stationSSP, 'SSP'), stX + 6, rowY + 7);
          stX += stationColWidths[3];

          doc.text(station.agent_count || 0, stX + 6, rowY + 7);
        });

        y += (Math.min(analytics.byStation.length, 12) * 24) + 30;
      }

      // Top Agents Section
      if (analytics.topAgents && analytics.topAgents.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor(TEXT)
           .text('Top Performing Agents', leftX, y);

        y += 20;

        const agentColWidths = [150, 80, 70, 110, 100];
        const agentHeaders = ['Agent Name', 'Station', 'Sales', 'Revenue (USD)', 'Avg Sale'];

        // Table header
        doc.rect(leftX, y, pageWidth, 22).fill(PRIMARY);
        let agX = leftX;
        agentHeaders.forEach((header, i) => {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(WHITE)
             .text(header, agX + 6, y + 6, { width: agentColWidths[i] - 12 });
          agX += agentColWidths[i];
        });

        y += 22;

        analytics.topAgents.slice(0, 10).forEach((agent, i) => {
          const rowY = y + (i * 22);
          const bgColor = i % 2 === 0 ? WHITE : LIGHT_BG;
          doc.rect(leftX, rowY, pageWidth, 22).fill(bgColor);

          const avgSale = agent.sales_count > 0 ? agent.total_amount / agent.sales_count : 0;

          agX = leftX;
          doc.fontSize(9).font('Helvetica').fillColor(TEXT)
             .text(agent.agent_name || 'Unknown', agX + 6, rowY + 6, { width: agentColWidths[0] - 12 });
          agX += agentColWidths[0];

          doc.text(agent.station_code || '-', agX + 6, rowY + 6);
          agX += agentColWidths[1];

          doc.text(formatNumber(agent.sales_count), agX + 6, rowY + 6);
          agX += agentColWidths[2];

          doc.text(formatCurrency(agent.total_amount, 'USD'), agX + 6, rowY + 6);
          agX += agentColWidths[3];

          doc.text(formatCurrency(avgSale, 'USD'), agX + 6, rowY + 6);
        });
      }

      // Footer
      const addFooter = (pageNum, totalPages) => {
        const footerY = doc.page.height - 35;
        doc.fontSize(8).font('Helvetica').fillColor(MUTED)
           .text(`Generated: ${formatDate(new Date())} | Kush Air - Sales & Settlements Report | Page ${pageNum} of ${totalPages}`,
                 leftX, footerY, { width: pageWidth, align: 'center' });
      };

      // Add footers
      doc.switchToPage(0);
      addFooter(1, 2);
      doc.switchToPage(1);
      addFooter(2, 2);

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

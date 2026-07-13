const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const valueOrFallback = (value, fallback) => {
  const numericValue = Number(value || 0);
  const numericFallback = Number(fallback || 0);
  return numericValue === 0 && numericFallback !== 0 ? numericFallback : numericValue;
};

/**
 * Ensure receipts directory exists
 */
const getReceiptsDir = () => {
  const dir = path.join(__dirname, '../../receipts');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

/**
 * Generate a PDF receipt for a payment.
 * Returns the absolute path of the generated file.
 */
const generateReceipt = (payment, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'LETTER'
      });
      
      const employeeName = `${user.firstName}-${user.lastName}`
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, '-');
      const filename = `boleta-de-pago-${employeeName}-${payment.month}-${payment.year}.pdf`;
      const dir = getReceiptsDir();
      const filePath = path.join(dir, filename);

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // --- Colors ---
      const primaryColor = '#1a237e'; // Dark Indigo
      const textColor = '#212121'; // Off-black
      const lightGrey = '#f5f5f5';
      const borderGrey = '#e0e0e0';
      const greenColor = '#2e7d32'; // Dark Green
      const redColor = '#c62828'; // Dark Red

      // --- Header / Branding ---
      doc.fillColor(primaryColor);
      doc.font('Helvetica-Bold').fontSize(18).text('COMPROBANTE DE PAGO DE NÓMINA', { align: 'center' });
      doc.moveDown(0.2);
      
      doc.fillColor('#616161');
      doc.font('Helvetica').fontSize(10).text('PLANILLA DE PAGO S.R.L.', { align: 'center' });
      doc.text('Cochabamba, Bolivia', { align: 'center' });
      doc.moveDown(1.5);

      // Draw a line
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor(primaryColor).lineWidth(1.5).stroke();
      doc.moveDown(1.2);

      // --- Receipt metadata (General Info) ---
      const formattedDate = new Date(payment.paidAt).toLocaleString('es-BO', {
        timeZone: 'America/La_Paz',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const monthName = months[payment.month - 1];

      doc.fillColor(primaryColor);
      doc.fontSize(11).font('Helvetica-Bold').text('INFORMACIÓN GENERAL');
      doc.moveDown(0.5);

      // Render Info in two columns
      doc.fillColor(textColor);
      doc.font('Helvetica').fontSize(9.5);
      
      const leftColX = 50;
      const rightColX = 320;
      const rowHeight = 16;
      let startY = doc.y;

      // Row 1
      doc.font('Helvetica-Bold').text('Empleado: ', leftColX, startY);
      doc.font('Helvetica').text(`${user.firstName} ${user.lastName}`, leftColX + 55, startY);
      
      doc.font('Helvetica-Bold').text('Período: ', rightColX, startY);
      doc.font('Helvetica').text(`${monthName} de ${payment.year}`, rightColX + 50, startY);

      // Row 2
      startY += rowHeight;
      doc.font('Helvetica-Bold').text('Email: ', leftColX, startY);
      doc.font('Helvetica').text(`${user.email}`, leftColX + 55, startY);
      
      doc.font('Helvetica-Bold').text('Fecha Pago: ', rightColX, startY);
      doc.font('Helvetica').text(`${formattedDate}`, rightColX + 65, startY);

      // Row 3
      startY += rowHeight;
      doc.font('Helvetica-Bold').text('Tipo Emp: ', leftColX, startY);
      doc.font('Helvetica').text(`${user.employeeType === 'FIJO' ? 'Fijo' : 'Temporal'}`, leftColX + 55, startY);
      
      doc.font('Helvetica-Bold').text('Comprobante: ', rightColX, startY);
      doc.font('Helvetica').text(`PAY-${payment.id.toString().padStart(6, '0')}`, rightColX + 70, startY);

      doc.moveDown(2);
      
      // Reset coordinates to current flow
      doc.y = startY + 25;

      // Draw another line
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor(borderGrey).lineWidth(1).stroke();
      doc.moveDown(1.2);

      // --- Financial breakdown table ---
      doc.fillColor(primaryColor);
      doc.fontSize(11).font('Helvetica-Bold').text('DESGLOSE DE SALARIOS');
      doc.moveDown(0.5);

      // Table Header Row
      const tableHeaderY = doc.y;
      doc.fillColor('#424242');
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Concepto', 55, tableHeaderY);
      doc.text('Detalle / Base', 300, tableHeaderY, { align: 'right', width: 100 });
      doc.text('Monto / Total', 450, tableHeaderY, { align: 'right', width: 105 });
      
      // Separator
      doc.moveTo(50, tableHeaderY + 12).lineTo(562, tableHeaderY + 12).strokeColor('#424242').lineWidth(1).stroke();
      doc.moveDown(1.5);

      // Rows data
      doc.font('Helvetica').fontSize(9.5).fillColor(textColor);
      
      const rows = [
        { 
          label: 'Salario Mensual Base', 
          detail: `${parseFloat(payment.monthlySalary).toFixed(2)} Bs.`, 
          total: `${parseFloat(payment.monthlySalary).toFixed(2)} Bs.` 
        },
        { 
          label: 'Horas Laborales Programadas', 
          detail: `${parseFloat(user.monthlyHours).toFixed(1)} hrs.`, 
          total: '-' 
        },
        { 
          label: 'Salario por Hora Calculado', 
          detail: `${parseFloat(payment.hourlyRate).toFixed(2)} Bs./hr.`, 
          total: '-' 
        },
        { 
          label: 'Horas Efectivamente Trabajadas', 
          detail: `${parseFloat(payment.totalHours).toFixed(2)} hrs.`, 
          total: '-' 
        },
        { 
          label: 'Salario Bruto', 
          detail: `Salario Mensual Base Completo`, 
          total: `${parseFloat(payment.grossPay).toFixed(2)} Bs.`,
          isBold: true
        },
        { 
          label: 'Retraso Acumulado en el Mes', 
          detail: `${payment.totalDelayMinutes} min. (${parseFloat(payment.delayHours).toFixed(2)} hrs.)`, 
          total: '-' 
        },
        { label: 'Retrasos Justificados', detail: `${payment.justifiedDelayMinutes || 0} min.`, total: 'Sin descuento' },
        { label: 'Horas Extra Aprobadas', detail: `${(payment.details || []).filter(d => d.code === 'OVERTIME').reduce((n,d)=>n+Number(d.quantity||0),0).toFixed(2)} hrs.`, total: `${Number(payment.overtimeAmount || 0).toFixed(2)} Bs.`, color: greenColor, isBold: true },
        ...(payment.details || []).filter(d => d.code === 'OVERTIME').map(d => ({
          label: d.description,
          detail: `${Number(d.quantity || 0).toFixed(2)} h × ${Number(d.metadata?.multiplier || 1).toFixed(2)} (${d.metadata?.startTime || '—'}–${d.metadata?.endTime || '—'})`,
          total: `${Number(d.amount).toFixed(2)} Bs.`,
          color: greenColor,
        })),
        { 
          label: 'Descuento por Retrasos (Deducción)', 
          detail: `${parseFloat(payment.delayHours).toFixed(2)} hrs.`, 
          total: `-${parseFloat(payment.discountAmount).toFixed(2)} Bs.`,
          color: redColor,
          isBold: true
        },
        ...(payment.details || []).filter(d => d.type === 'DISCOUNT' && d.code !== 'UNJUSTIFIED_DELAY').map(d => ({ label: d.description, detail: d.code, total: `-${Number(d.amount).toFixed(2)} Bs.`, color: redColor })),
        { label: 'TOTAL INGRESOS', detail: 'Salario base + horas extra', total: `${valueOrFallback(payment.totalIncome, payment.grossPay).toFixed(2)} Bs.`, isBold: true },
        { label: 'TOTAL DESCUENTOS', detail: 'Conceptos aprobados', total: `-${valueOrFallback(payment.totalDiscounts, payment.discountAmount).toFixed(2)} Bs.`, color: redColor, isBold: true }
      ];

      rows.forEach(r => {
        const itemY = doc.y;
        
        // Draw zebra striping background if row is odd
        // Let's just keep it clean with divider lines
        
        if (r.color) doc.fillColor(r.color);
        else doc.fillColor(textColor);

        if (r.isBold) doc.font('Helvetica-Bold');
        else doc.font('Helvetica');

        const labelOptions = { width: 230 };
        const detailOptions = { align: 'right', width: 135 };
        const totalOptions = { align: 'right', width: 105 };
        const contentHeight = Math.max(
          doc.heightOfString(r.label, labelOptions),
          doc.heightOfString(r.detail, detailOptions),
          doc.heightOfString(r.total, totalOptions)
        );
        const rowHeight = Math.max(18, contentHeight + 7);

        doc.text(r.label, 55, itemY, labelOptions);
        doc.text(r.detail, 300, itemY, detailOptions);
        doc.text(r.total, 450, itemY, totalOptions);

        doc.y = itemY + rowHeight;
        doc.moveTo(50, doc.y - 3).lineTo(562, doc.y - 3).strokeColor(lightGrey).lineWidth(0.5).stroke();
      });

      doc.moveDown(1.5);

      // --- Total Block ---
      const totalBoxY = doc.y;
      
      // Draw background rect for total
      doc.rect(50, totalBoxY, 512, 32).fill(lightGrey);
      
      doc.fillColor(greenColor);
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('LÍQUIDO PAGABLE (SALARIO NETO)', 60, totalBoxY + 11);
      
      const netPayFormatted = `${parseFloat(payment.netPay).toFixed(2)} Bs.`;
      doc.text(netPayFormatted, 400, totalBoxY + 11, { align: 'right', width: 155 });

      doc.y = totalBoxY + 45;
      doc.moveDown(3);

      // --- Signatures ---
      const signatureY = doc.y;
      doc.fillColor('#424242');
      doc.font('Helvetica').fontSize(9);
      
      doc.moveTo(80, signatureY).lineTo(220, signatureY).strokeColor('#757575').lineWidth(0.8).stroke();
      doc.text('Firma Autorizada', 80, signatureY + 5, { align: 'center', width: 140 });

      doc.moveTo(390, signatureY).lineTo(530, signatureY).strokeColor('#757575').lineWidth(0.8).stroke();
      doc.text('Recibí Conforme (Firma Empleado)', 390, signatureY + 5, { align: 'center', width: 140 });

      // --- Footer ---
      const footerY = doc.page.height - 70;
      doc.fillColor('#9e9e9e');
      doc.font('Helvetica').fontSize(8);
      doc.moveTo(50, footerY - 10).lineTo(562, footerY - 10).strokeColor(borderGrey).lineWidth(0.5).stroke();
      
      doc.text('Este documento sirve como constancia oficial de pago y de depósitos provisionales.', 50, footerY, { align: 'center', width: 512 });
      doc.text(`Generado automáticamente el ${new Date().toLocaleDateString('es-BO')} - Planilla de Pago S.R.L.`, 50, footerY + 10, { align: 'center', width: 512 });

      doc.end();

      writeStream.on('finish', () => {
        resolve(filePath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

const generateMonthlyReport = async (payments, month, year) => {
  const dir = getReceiptsDir();
  const filePath = path.join(dir, `boleta-de-pago-mensual-${month}-${year}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 35, size: 'LETTER', layout: 'landscape' });
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);

    const primary = '#1a237e';
    const text = '#212121';
    const muted = '#616161';
    const light = '#f5f7fb';
    const border = '#dfe3eb';
    const green = '#2e7d32';
    const red = '#c62828';
    const columns = [
      { label: 'Empleado', x: 35, width: 190, align: 'left' },
      { label: 'Salario base', x: 225, width: 85, align: 'right' },
      { label: 'Horas extra', x: 310, width: 75, align: 'right' },
      { label: 'Ingresos', x: 385, width: 90, align: 'right' },
      { label: 'Descuentos', x: 475, width: 90, align: 'right' },
      { label: 'Neto', x: 565, width: 90, align: 'right' },
      { label: 'Estado', x: 655, width: 100, align: 'center' },
    ];

    const drawPageHeading = () => {
      doc.save().rect(0, 0, 792, 612).fill('#ffffff').restore();
      doc.fillColor(primary).font('Helvetica-Bold').fontSize(18)
        .text('REPORTE GENERAL MENSUAL DE PLANILLA', 35, 38, { width: 722, align: 'center' });
      doc.fillColor(muted).font('Helvetica').fontSize(9.5)
        .text(`Periodo: ${String(month).padStart(2, '0')}/${year}  |  Generado: ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`, 35, 65, { width: 722, align: 'center' });
      doc.moveTo(35, 88).lineTo(757, 88).strokeColor(primary).lineWidth(1.5).stroke();
    };

    const drawTableHeader = y => {
      doc.rect(35, y, 722, 28).fill(primary);
      columns.forEach(column => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
          .text(column.label, column.x + 6, y + 9, {
            width: column.width - 12,
            align: column.align,
            lineBreak: false,
          });
      });
      return y + 28;
    };

    drawPageHeading();
    let y = drawTableHeader(104);
    const totals = { base: 0, extra: 0, income: 0, discounts: 0, net: 0 };

    payments.forEach((payment, index) => {
      if (y > 486) {
        doc.addPage();
        drawPageHeading();
        y = drawTableHeader(104);
      }

      const base = Number(payment.monthlySalary || 0);
      const extra = Number(payment.overtimeAmount || 0);
      const income = valueOrFallback(payment.totalIncome, payment.grossPay);
      const discounts = valueOrFallback(payment.totalDiscounts, payment.discountAmount);
      const net = Number(payment.netPay || 0);
      totals.base += base;
      totals.extra += extra;
      totals.income += income;
      totals.discounts += discounts;
      totals.net += net;

      if (index % 2 === 0) doc.rect(35, y, 722, 27).fill(light);
      doc.moveTo(35, y + 27).lineTo(757, y + 27).strokeColor(border).lineWidth(0.4).stroke();

      const values = [
        `${payment.user.firstName} ${payment.user.lastName}`,
        base.toFixed(2),
        extra.toFixed(2),
        income.toFixed(2),
        discounts.toFixed(2),
        net.toFixed(2),
        'Pagado',
      ];
      values.forEach((value, columnIndex) => {
        const column = columns[columnIndex];
        const valueColor = columnIndex === 4 ? red : columnIndex === 5 ? green : text;
        doc.fillColor(valueColor).font(columnIndex >= 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .text(value, column.x + 6, y + 9, {
            width: column.width - 12,
            align: column.align,
            lineBreak: false,
          });
      });
      y += 27;
    });

    const summaryY = Math.min(y + 24, 470);
    doc.roundedRect(35, summaryY, 722, 72, 6).fillAndStroke(light, border);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(10)
      .text('RESUMEN DEL PERIODO', 50, summaryY + 12);

    const summaryItems = [
      ['Empleados pagados', String(payments.length)],
      ['Salarios base', `Bs. ${totals.base.toFixed(2)}`],
      ['Horas extra', `Bs. ${totals.extra.toFixed(2)}`],
      ['Ingresos', `Bs. ${totals.income.toFixed(2)}`],
      ['Descuentos', `Bs. ${totals.discounts.toFixed(2)}`],
      ['Neto pagado', `Bs. ${totals.net.toFixed(2)}`],
    ];
    summaryItems.forEach((item, index) => {
      const itemX = 50 + (index % 3) * 235;
      const itemY = summaryY + 32 + Math.floor(index / 3) * 20;
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(`${item[0]}:`, itemX, itemY, { width: 95 });
      doc.fillColor(index === 4 ? red : index === 5 ? green : text).font('Helvetica-Bold').fontSize(8.5)
        .text(item[1], itemX + 98, itemY, { width: 122, align: 'right' });
    });

    doc.fillColor('#9e9e9e').font('Helvetica').fontSize(7.5)
      .text('Planilla de Pago S.R.L. - Reporte administrativo de nómina', 35, 570, { width: 722, align: 'center' });

    doc.end();
    out.on('finish', () => resolve(filePath));
    out.on('error', reject);
  });
};
module.exports = { generateReceipt, generateMonthlyReport };

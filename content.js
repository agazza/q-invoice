// Content script for Gmail and Google Drive
(function() {
  'use strict';

  // Load QRCode library
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('qrcode.min.js');
  document.head.appendChild(script);

  // Load PDF.js library
  const pdfScript = document.createElement('script');
  pdfScript.src = chrome.runtime.getURL('pdfjs/pdf.min.js');
  pdfScript.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.js');
  };
  document.head.appendChild(pdfScript);

  // Parser for Italian FatturaPA XML
  class FatturaPAParser {
    static parseXML(xmlString) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      
      // Check for parsing errors
      if (xmlDoc.querySelector('parsererror')) {
        console.error('XML parsing error');
        return null;
      }

      try {
        // Extract payment data from FatturaPA
        const cedente = xmlDoc.querySelector('CedentePrestatore');
        const beneficiary = cedente?.querySelector('Anagrafica Nome')?.textContent + ' ' + 
                           cedente?.querySelector('Anagrafica Cognome')?.textContent ||
                           cedente?.querySelector('Anagrafica Denominazione')?.textContent || 'Unknown';
        
        // IBAN from payment details
        const iban = xmlDoc.querySelector('DatiPagamento IBAN')?.textContent?.replace(/\s/g, '') || '';
        
        // Total amount
        const importo = xmlDoc.querySelector('DatiPagamento ImportoPagamento')?.textContent || 
                       xmlDoc.querySelector('DatiGenerali ImportoTotaleDocumento')?.textContent || '0';
        
        // Payment reference (numero documento)
        const numeroDoc = xmlDoc.querySelector('DatiGeneraliDocumento Numero')?.textContent || '';
        const dataDoc = xmlDoc.querySelector('DatiGeneraliDocumento Data')?.textContent || '';
        const causale = xmlDoc.querySelector('DatiPagamento Causale')?.textContent || 
                       `Fattura ${numeroDoc} del ${dataDoc}`;

        return {
          beneficiary: beneficiary.trim(),
          iban: iban,
          amount: parseFloat(importo).toFixed(2),
          reference: causale.substring(0, 140) // EPC max 140 chars
        };
      } catch (e) {
        console.error('Error parsing FatturaPA:', e);
        return null;
      }
    }
  }

  // EPC QR Code Generator
  class EPCQRGenerator {
    static generate(paymentData) {
      // EPC QR Code format (SEPA Credit Transfer)
      const lines = [
        'BCD',                           // Service Tag
        '002',                           // Version
        '1',                             // Character set (UTF-8)
        'SCT',                           // Identification
        '',                              // BIC (optional)
        paymentData.beneficiary,         // Beneficiary name
        paymentData.iban,                // Beneficiary account (IBAN)
        'EUR' + paymentData.amount,      // Amount (EUR + value)
        '',                              // Purpose (optional)
        paymentData.reference,           // Structured reference
        '',                              // Unstructured remittance
        ''                               // Beneficiary to originator info
      ];
      
      return lines.join('\n');
    }
  }

  // UI Component
  class QRCodeModal {
    constructor() {
      this.modal = null;
    }

    show(paymentData, qrData) {
      // Remove existing modal if any
      this.hide();

      // Create modal
      this.modal = document.createElement('div');
      this.modal.className = 'invoice-qr-modal';
      this.modal.innerHTML = `
        <div class="invoice-qr-content">
          <div class="invoice-qr-header">
            <h2>Pagamento Fattura</h2>
            <button class="invoice-qr-close">&times;</button>
          </div>
          <div class="invoice-qr-body">
            <div class="invoice-qr-info">
              <p><strong>Beneficiario:</strong> ${this.escapeHtml(paymentData.beneficiary)}</p>
              <p><strong>IBAN:</strong> ${this.escapeHtml(paymentData.iban)}</p>
              <p><strong>Importo:</strong> €${this.escapeHtml(paymentData.amount)}</p>
              <p><strong>Causale:</strong> ${this.escapeHtml(paymentData.reference)}</p>
            </div>
            <div class="invoice-qr-code" id="qrcode-container"></div>
            <p class="invoice-qr-instructions">
              Scansiona il QR code con l'app della tua banca per pagare
            </p>
          </div>
        </div>
      `;

      document.body.appendChild(this.modal);

      // Generate QR code
      setTimeout(() => {
        new QRCode(document.getElementById('qrcode-container'), {
          text: qrData,
          width: 256,
          height: 256,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L
        });
      }, 100);

      // Close button handler
      this.modal.querySelector('.invoice-qr-close').addEventListener('click', () => {
        this.hide();
      });

      // Close on background click
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.hide();
        }
      });
    }

    hide() {
      if (this.modal) {
        this.modal.remove();
        this.modal = null;
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // PDF Handler
  class PDFHandler {
    // Level 1: search for embedded FatturaPA XML inside a PDF (byte-safe latin1 decoding)
    static extractXMLFromPDF(arrayBuffer) {
      const text = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer));
      const xmlStart = text.indexOf('<?xml');
      if (xmlStart === -1) return null;
      const closingTags = [
        '</FatturaElettronica>',
        '</n1:FatturaElettronica>',
        '</p:FatturaElettronica>',
        '</ns2:FatturaElettronica>'
      ];
      for (const tag of closingTags) {
        const endIdx = text.lastIndexOf(tag);
        if (endIdx !== -1) return text.substring(xmlStart, endIdx + tag.length);
      }
      return null;
    }

    // Level 2: extract all text from a PDF using PDF.js
    static async extractTextFromPDF(arrayBuffer) {
      const pdfLib = window.pdfjsLib;
      if (!pdfLib) throw new Error('PDF.js non disponibile');
      const pdf = await pdfLib.getDocument({ data: arrayBuffer }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
      }
      return pages.join('\n');
    }

    // Parse payment data from unstructured PDF text (best-effort)
    static parsePaymentDataFromText(text) {
      // IBAN: standard format (IT + 2 digits + 23 alphanum for Italian, or generic)
      const ibanMatch = text.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/);
      if (!ibanMatch) return null;
      const iban = ibanMatch[1].replace(/\s/g, '');

      // Amount: look for totale/importo keyword then a number (Italian format 1.220,00 or 1220.00)
      const amountMatch = text.match(/(?:totale|importo)[^\d]{0,30}([\d]{1,6}[.,][\d.,]{2,6})/i);
      let amount = '0.00';
      if (amountMatch) {
        // Normalise Italian number format (1.220,00 → 1220.00)
        amount = amountMatch[1].replace(/\./g, '').replace(',', '.');
        amount = parseFloat(amount).toFixed(2);
      }

      // Beneficiary: first non-empty line of the PDF text (usually the company name)
      const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 2);
      const beneficiary = lines[0] || 'Beneficiario sconosciuto';

      // Reference: look for invoice number and date
      const numMatch = text.match(/(?:fattura|n[°.]?)\s*[:\s]*([\w/\-]+)/i);
      const dateMatch = text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
      const reference = [
        numMatch ? `Fattura ${numMatch[1]}` : '',
        dateMatch ? `del ${dateMatch[1]}` : ''
      ].filter(Boolean).join(' ').substring(0, 140) || 'Pagamento fattura';

      return { beneficiary, iban, amount, reference };
    }

    static async processFile(file) {
      try {
        const arrayBuffer = await file.arrayBuffer();

        if (file.name.endsWith('.xml')) {
          return { xmlContent: new TextDecoder('utf-8').decode(arrayBuffer) };
        }

        if (file.name.endsWith('.pdf')) {
          // Try embedded XML first (more reliable)
          const xml = this.extractXMLFromPDF(arrayBuffer);
          if (xml) return { xmlContent: xml };

          // Fall back to PDF text extraction
          const pdfText = await this.extractTextFromPDF(arrayBuffer);
          const paymentData = this.parsePaymentDataFromText(pdfText);
          if (paymentData) return { paymentData };
        }

        return null;
      } catch (e) {
        console.error('Error processing file:', e);
        return null;
      }
    }
  }

  // Main handler
  const qrModal = new QRCodeModal();

  function createQRButton() {
    const button = document.createElement('button');
    button.className = 'invoice-qr-button';
    button.innerHTML = '💳 Genera QR Pagamento';
    button.title = 'Genera QR code per pagare questa fattura';
    return button;
  }

  async function handleInvoiceFile(file) {
    const result = await PDFHandler.processFile(file);

    if (!result) {
      alert('Impossibile estrarre dati dalla fattura. Assicurati che sia una fattura elettronica italiana valida.');
      return;
    }

    let paymentData;
    if (result.xmlContent) {
      paymentData = FatturaPAParser.parseXML(result.xmlContent);
    } else {
      paymentData = result.paymentData;
    }

    if (!paymentData || !paymentData.iban) {
      alert('Impossibile trovare i dati di pagamento nella fattura.');
      return;
    }

    const qrData = EPCQRGenerator.generate(paymentData);
    qrModal.show(paymentData, qrData);
  }

  // Gmail Integration
  function initGmail() {
    // Watch for attachment changes
    const observer = new MutationObserver(() => {
      const attachments = document.querySelectorAll('[data-tooltip*=".pdf"], [data-tooltip*=".xml"]');
      
      attachments.forEach(attachment => {
        if (attachment.querySelector('.invoice-qr-button')) return;
        
        const fileName = attachment.getAttribute('data-tooltip') || '';
        if (fileName.toLowerCase().includes('fattur') || fileName.endsWith('.xml')) {
          const button = createQRButton();
          button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Try to download the attachment
            const downloadLink = attachment.querySelector('a[download]');
            if (downloadLink) {
              const href = downloadLink.href;
              const response = await fetch(href);
              const blob = await response.blob();
              const file = new File([blob], fileName);
              await handleInvoiceFile(file);
            }
          });
          
          attachment.appendChild(button);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Google Drive Integration
  function initDrive() {
    // Add button to file preview/details
    const observer = new MutationObserver(() => {
      const previewPanes = document.querySelectorAll('[data-id]');
      
      previewPanes.forEach(pane => {
        const fileName = pane.getAttribute('aria-label') || pane.textContent || '';
        
        if ((fileName.toLowerCase().includes('fattur') || fileName.endsWith('.xml')) && 
            !pane.querySelector('.invoice-qr-button')) {
          
          const button = createQRButton();
          button.style.margin = '10px';
          
          button.addEventListener('click', async (e) => {
            e.preventDefault();
            alert('Google Drive integration: Please download the file and drag it to the extension or open in Gmail');
          });
          
          pane.appendChild(button);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // File drop handler for manual processing
  function initDropZone() {
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      
      const files = Array.from(e.dataTransfer.files);
      const invoiceFile = files.find(f => 
        f.name.endsWith('.pdf') || f.name.endsWith('.xml')
      );
      
      if (invoiceFile) {
        await handleInvoiceFile(invoiceFile);
      }
    });
  }

  // Initialize based on current site
  function init() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('mail.google.com')) {
      initGmail();
    } else if (hostname.includes('drive.google.com')) {
      initDrive();
    }
    
    initDropZone();
  }

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

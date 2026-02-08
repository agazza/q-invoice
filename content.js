// Content script for Gmail and Google Drive
(function() {
  'use strict';

  // Load QRCode library
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('qrcode.min.js');
  document.head.appendChild(script);

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
          correctLevel: QRCode.CorrectLevel.M
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
    static async extractXMLFromPDF(arrayBuffer) {
      // For now, we'll try to extract embedded XML from PDF
      // Italian e-invoices are often XML files, sometimes in PDF containers
      const uint8Array = new Uint8Array(arrayBuffer);
      const text = new TextDecoder('utf-8').decode(uint8Array);
      
      // Try to find XML content
      const xmlMatch = text.match(/<\?xml[\s\S]*?<\/.*?FatturaElettronica.*?>/);
      if (xmlMatch) {
        return xmlMatch[0];
      }
      
      return null;
    }

    static async processFile(file) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Check if it's an XML file directly
        if (file.name.endsWith('.xml')) {
          const text = new TextDecoder('utf-8').decode(arrayBuffer);
          return text;
        }
        
        // Try to extract XML from PDF
        if (file.name.endsWith('.pdf')) {
          return await this.extractXMLFromPDF(arrayBuffer);
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
    const xmlContent = await PDFHandler.processFile(file);
    
    if (!xmlContent) {
      alert('Impossibile estrarre dati dalla fattura. Assicurati che sia una fattura elettronica italiana valida.');
      return;
    }

    const paymentData = FatturaPAParser.parseXML(xmlContent);
    
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

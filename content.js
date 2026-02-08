// Content script for Gmail and Google Drive
(function() {
  'use strict';

  console.log('🚀 Invoice QR Extension loaded');

  // Load QRCode library
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('qrcode.min.js');
  script.onload = () => console.log('✅ QRCode library loaded');
  script.onerror = () => console.error('❌ Failed to load QRCode library');
  document.head.appendChild(script);

  // Load PDF.js library
  const pdfScript = document.createElement('script');
  pdfScript.src = chrome.runtime.getURL('pdf.min.js');
  pdfScript.onload = () => console.log('✅ PDF.js library loaded');
  pdfScript.onerror = () => console.error('❌ Failed to load PDF.js library');
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
          reference: causale.substring(0, 140),
          source: 'XML'
        };
      } catch (e) {
        console.error('Error parsing FatturaPA:', e);
        return null;
      }
    }
  }

  // PDF Text Parser for courtesy copy PDFs
  class PDFTextParser {
    
    static async extractTextFromPDF(arrayBuffer) {
      console.log('📄 Extracting text from PDF...');
      
      try {
        // Wait for PDF.js to be loaded
        if (typeof pdfjsLib === 'undefined') {
          console.error('PDF.js not loaded yet');
          return null;
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        // Extract text from all pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }
        
        console.log('✅ Extracted', fullText.length, 'characters from PDF');
        return fullText;
        
      } catch (e) {
        console.error('Error extracting PDF text:', e);
        
        // Fallback: try simple text extraction from bytes
        const uint8Array = new Uint8Array(arrayBuffer);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
        return text;
      }
    }

    static parseInvoiceFromText(text) {
      console.log('🔍 Parsing invoice data from text...');
      
      try {
        // Extract IBAN (Italian format: IT + 2 digits + letter + 10 digits + 12 alphanumeric)
        const ibanPatterns = [
          /IT\s*\d{2}\s*[A-Z]\s*\d{3}\s*\d{3}\s*\d{4}\s*[A-Z0-9]{12}/gi,
          /IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}/gi,
          /IBAN[:\s]*([A-Z]{2}\d{2}[A-Z0-9\s]{15,34})/gi
        ];
        
        let iban = null;
        for (const pattern of ibanPatterns) {
          const match = text.match(pattern);
          if (match) {
            iban = match[0].replace(/IBAN[:\s]*/i, '').replace(/\s/g, '');
            console.log('✅ IBAN found:', iban);
            break;
          }
        }
        
        // Extract amount with various patterns
        const amountPatterns = [
          /(?:importo\s+totale|totale\s+documento|totale\s+fattura)[:\s]*€?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
          /(?:da\s+pagare|netto\s+a\s+pagare)[:\s]*€?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
          /(?:totale|importo)[:\s]*€?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi
        ];
        
        let amount = null;
        for (const pattern of amountPatterns) {
          const matches = [...text.matchAll(pattern)];
          if (matches.length > 0) {
            // Take the last match (usually the final total)
            const lastMatch = matches[matches.length - 1];
            amount = lastMatch[1].replace(/\./g, '').replace(',', '.');
            console.log('✅ Amount found:', amount);
            break;
          }
        }
        
        // Extract beneficiary (supplier/seller)
        const beneficiaryPatterns = [
          /(?:cedente|prestatore|fornitore)[:\s\n]+(?:denominazione[:\s\n]+)?([A-Z][^\n]{5,70})/i,
          /(?:ragione\s+sociale|denominazione)[:\s\n]+([A-Z][^\n]{5,70})/i,
          /(?:partita\s+iva[:\s\d\s]+)([A-Z][^\n]{5,70})/i
        ];
        
        let beneficiary = 'Beneficiario non trovato';
        for (const pattern of beneficiaryPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            beneficiary = match[1].trim()
              .replace(/\s+/g, ' ')
              .replace(/[^\w\s\-\.]/g, '');
            console.log('✅ Beneficiary found:', beneficiary);
            break;
          }
        }
        
        // Extract invoice number and date
        const numeroPatterns = [
          /(?:numero|n\.?|fattura\s+n\.?)[:\s]*(\d+\/\d{4})/i,
          /(?:fattura)[:\s]*n?\.?\s*(\d+)/i
        ];
        
        let numero = '';
        for (const pattern of numeroPatterns) {
          const match = text.match(pattern);
          if (match) {
            numero = match[1];
            console.log('✅ Invoice number found:', numero);
            break;
          }
        }
        
        const dataPatterns = [
          /(?:data)[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
          /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/
        ];
        
        let data = '';
        for (const pattern of dataPatterns) {
          const match = text.match(pattern);
          if (match) {
            data = match[1];
            console.log('✅ Invoice date found:', data);
            break;
          }
        }
        
        const causale = numero && data 
          ? `Fattura ${numero} del ${data}` 
          : numero 
            ? `Fattura ${numero}`
            : 'Pagamento fattura';
        
        // Validation
        if (!iban) {
          console.warn('⚠️ IBAN not found in PDF');
          return null;
        }
        
        if (!amount) {
          console.warn('⚠️ Amount not found in PDF');
          return null;
        }
        
        // Validate IBAN format
        const ibanClean = iban.replace(/\s/g, '');
        if (!ibanClean.match(/^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/)) {
          console.warn('⚠️ Invalid IBAN format:', ibanClean);
          // Still try to use it, but warn user
        }
        
        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          console.warn('⚠️ Invalid amount:', amount);
          return null;
        }
        
        console.log('✅ Successfully parsed invoice from PDF');
        
        return {
          beneficiary: beneficiary.substring(0, 70),
          iban: ibanClean,
          amount: amountNum.toFixed(2),
          reference: causale.substring(0, 140),
          source: 'PDF'
        };
        
      } catch (e) {
        console.error('Error parsing invoice text:', e);
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

      // Create modal with payment info and QR code
      const sourceLabel = paymentData.source === 'PDF' 
        ? '⚠️ Dati estratti da PDF - verifica prima di pagare!' 
        : '✅ Dati da fattura XML ufficiale';

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
              <p style="color: ${paymentData.source === 'PDF' ? '#f9ab00' : '#34a853'}; font-weight: 500; margin-bottom: 12px;">
                ${sourceLabel}
              </p>
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
        if (typeof QRCode !== 'undefined') {
          new QRCode(document.getElementById('qrcode-container'), {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        } else {
          console.error('QRCode library not loaded!');
          alert('Errore: libreria QR code non caricata. Ricarica la pagina.');
        }
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

  // File Handler with PDF support
  class FileHandler {
    static async extractXMLFromPDF(arrayBuffer) {
      // Try to find embedded XML in PDF
      const uint8Array = new Uint8Array(arrayBuffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
      
      const xmlMatch = text.match(/<\?xml[\s\S]*?<\/.*?FatturaElettronica.*?>/);
      if (xmlMatch) {
        console.log('✅ Found embedded XML in PDF');
        return xmlMatch[0];
      }
      
      return null;
    }

    static async processFile(file) {
      console.log('📄 Processing file:', file.name, '- Type:', file.type);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Handle XML files
        if (file.name.endsWith('.xml')) {
          console.log('📄 Processing XML file...');
          const text = new TextDecoder('utf-8').decode(arrayBuffer);
          const paymentData = FatturaPAParser.parseXML(text);
          return paymentData;
        }
        
        // Handle PDF files
        if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
          console.log('📄 Processing PDF file...');
          
          // First, try to find embedded XML
          const embeddedXML = await this.extractXMLFromPDF(arrayBuffer);
          if (embeddedXML) {
            console.log('✅ Using embedded XML from PDF');
            const paymentData = FatturaPAParser.parseXML(embeddedXML);
            if (paymentData) return paymentData;
          }
          
          // If no XML found, parse PDF text
          console.log('📄 No embedded XML, parsing PDF text...');
          const pdfText = await PDFTextParser.extractTextFromPDF(arrayBuffer);
          if (pdfText) {
            const paymentData = PDFTextParser.parseInvoiceFromText(pdfText);
            return paymentData;
          }
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
    button.innerHTML = '💳 Genera QR';
    button.title = 'Genera QR code per pagare questa fattura';
    return button;
  }

  async function handleInvoiceFile(file) {
    console.log('📥 Handling invoice file:', file.name);
    
    const paymentData = await FileHandler.processFile(file);
    
    if (!paymentData) {
      alert('Impossibile estrarre dati dalla fattura.\n\nAssicurati che:\n- Sia una fattura elettronica italiana (XML o PDF)\n- Il PDF contenga i dati di pagamento (IBAN e importo)');
      return;
    }

    if (!paymentData.iban) {
      alert('IBAN non trovato nella fattura.\n\nVerifica che la fattura contenga le coordinate bancarie per il pagamento.');
      return;
    }

    console.log('✅ Payment data extracted:', paymentData);

    const qrData = EPCQRGenerator.generate(paymentData);
    qrModal.show(paymentData, qrData);
  }

  // Gmail Integration
  function initGmail() {
    console.log('📧 Initializing Gmail integration...');
    
    const observer = new MutationObserver(() => {
      const selectors = [
        'span[data-tooltip-class="a1V"]',
        '.aZo',
        '[role="listitem"]',
        'div[data-tooltip]',
      ];

      selectors.forEach(selector => {
        const attachments = document.querySelectorAll(selector);
        
        attachments.forEach(attachment => {
          if (attachment.querySelector('.invoice-qr-button')) return;
          
          const fileName = attachment.getAttribute('data-tooltip') || 
                          attachment.getAttribute('download') ||
                          attachment.getAttribute('aria-label') ||
                          attachment.textContent || '';
          
          if (fileName.toLowerCase().includes('fattur') || 
              fileName.endsWith('.xml') ||
              fileName.endsWith('.pdf')) {
            
            console.log('✅ Invoice attachment detected:', fileName);
            
            const button = createQRButton();
            button.style.marginLeft = '8px';
            
            button.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              console.log('🖱️ Button clicked for:', fileName);
              alert('Scarica l\'allegato e trascinalo sulla pagina Gmail per generare il QR code.\n\n(Stiamo lavorando per scaricare automaticamente gli allegati!)');
            });
            
            attachment.appendChild(button);
          }
        });
      });
    });

    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    console.log('✅ Gmail observer started');
  }

  // Google Drive Integration
  function initDrive() {
    console.log('💾 Initializing Google Drive integration...');
    
    const observer = new MutationObserver(() => {
      const previewPanes = document.querySelectorAll('[data-id]');
      
      previewPanes.forEach(pane => {
        const fileName = pane.getAttribute('aria-label') || pane.textContent || '';
        
        if ((fileName.toLowerCase().includes('fattur') || 
             fileName.endsWith('.xml') || 
             fileName.endsWith('.pdf')) && 
            !pane.querySelector('.invoice-qr-button')) {
          
          const button = createQRButton();
          button.style.margin = '10px';
          
          button.addEventListener('click', async (e) => {
            e.preventDefault();
            alert('Scarica il file e trascinalo sulla pagina per generare il QR code');
          });
          
          pane.appendChild(button);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('✅ Drive observer started');
  }

  // File drop handler
  function initDropZone() {
    console.log('📂 Initializing drop zone...');
    
    let dragCounter = 0;
    let dropOverlay = null;

    document.addEventListener('dragenter', (e) => {
      dragCounter++;
      
      if (dragCounter === 1) {
        dropOverlay = document.createElement('div');
        dropOverlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(26, 115, 232, 0.1);
          border: 3px dashed #1a73e8;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #1a73e8;
          font-weight: bold;
          pointer-events: none;
        `;
        dropOverlay.textContent = '📄 Rilascia la fattura (XML o PDF) per generare il QR code';
        document.body.appendChild(dropOverlay);
      }
    });

    document.addEventListener('dragleave', (e) => {
      dragCounter--;
      
      if (dragCounter === 0 && dropOverlay) {
        dropOverlay.remove();
        dropOverlay = null;
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      
      if (dropOverlay) {
        dropOverlay.remove();
        dropOverlay = null;
      }
      
      const files = Array.from(e.dataTransfer.files);
      const invoiceFile = files.find(f => 
        f.name.endsWith('.pdf') || f.name.endsWith('.xml')
      );
      
      if (invoiceFile) {
        console.log('📥 File dropped:', invoiceFile.name);
        await handleInvoiceFile(invoiceFile);
      } else {
        alert('Per favore trascina un file XML o PDF di fattura');
      }
    });
    
    console.log('✅ Drop zone initialized');
  }

  // Initialize
  function init() {
    const hostname = window.location.hostname;
    console.log('🌐 Initializing on:', hostname);
    
    if (hostname.includes('mail.google.com')) {
      initGmail();
    } else if (hostname.includes('drive.google.com')) {
      initDrive();
    }
    
    initDropZone();
    
    console.log('✅ Extension fully initialized!');
    console.log('💡 Trascina un file XML o PDF sulla pagina per testare!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

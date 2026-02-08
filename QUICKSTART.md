# 🚀 Quick Start Guide - Italian Invoice QR Payment Extension

## 📦 Cosa hai ricevuto

Una Chrome Extension completa che:
- ✅ Legge fatture elettroniche italiane (FatturaPA XML)
- ✅ Estrae dati di pagamento (IBAN, importo, beneficiario, causale)
- ✅ Genera QR code EPC compatibili con app bancarie italiane
- ✅ Si integra con Gmail e Google Drive

## ⚡ Installazione in 3 passi

### 1. Prepara i file
Estrai tutti i file in una cartella (es: `invoice-qr-extension`)

### 2. Carica in Chrome
1. Apri Chrome e vai a: `chrome://extensions/`
2. Attiva **"Modalità sviluppatore"** (interruttore in alto a destra)
3. Clicca **"Carica estensione non pacchettizzata"**
4. Seleziona la cartella `invoice-qr-extension`

### 3. Testa subito!
Apri il file `test.html` in Chrome per provare la funzionalità:
- Trascina un file XML di fattura
- Oppure clicca "Usa Fattura di Esempio"
- Vedrai il QR code generato!

## 🎯 Utilizzo

### In Gmail
1. Apri una email con fattura allegata (.xml o .pdf)
2. Vedrai il pulsante "💳 Genera QR Pagamento"
3. Clicca e scansiona il QR con l'app della banca

### In Google Drive  
1. Trova il file della fattura
2. Usa il pulsante "Genera QR Pagamento"
3. (Temporaneamente: scarica e trascina il file)

### Ovunque (Drag & Drop)
Trascina un file XML/PDF su Gmail o Drive e il QR verrà generato automaticamente!

## 📋 File dell'estensione

```
invoice-qr-extension/
├── manifest.json         ← Configurazione Chrome
├── content.js           ← Logica principale
├── styles.css           ← Stili UI
├── qrcode.min.js        ← Libreria QR code
├── icon16.png           ← Icona piccola
├── icon48.png           ← Icona media
├── icon128.png          ← Icona grande
├── test.html            ← Pagina di test
├── test-invoice.xml     ← Fattura di esempio
└── README.md            ← Documentazione completa
```

## 🔍 Test con fattura di esempio

Inclusa una fattura di test con questi dati:
- **Beneficiario**: Acme S.r.l.
- **IBAN**: IT60X0542811101000000123456
- **Importo**: €1220.00
- **Causale**: Fattura 2026/001 del 05/02/2026

## 🎨 Caratteristiche QR Code

Il QR generato usa lo standard **EPC (European Payments Council)**:
- ✅ Compatibile con bonifici SEPA
- ✅ Supportato da tutte le principali banche italiane
- ✅ Include: beneficiario, IBAN, importo, causale
- ✅ Pronto per scansione da app banking

## 🔐 Privacy

- ✅ Tutto elaborato localmente nel browser
- ✅ Nessun dato inviato a server esterni
- ✅ Nessuna raccolta di informazioni
- ✅ Open source e verificabile

## ⚙️ Requisiti tecnici

- Google Chrome (o Chromium: Edge, Brave, etc.)
- Fatture in formato FatturaPA XML standard
- Per PDF: devono contenere XML embedded

## 🐛 Problemi comuni

**Il pulsante non appare in Gmail?**
- Controlla che l'estensione sia attiva in `chrome://extensions/`
- Ricarica la pagina Gmail (F5)

**"Impossibile estrarre dati dalla fattura"?**
- Verifica che sia una fattura FatturaPA XML valida
- I PDF devono contenere XML embedded (non solo scansioni)

**Il QR non viene scansionato?**
- Verifica che l'app bancaria supporti EPC QR code
- Assicurati che lo schermo sia luminoso
- Prova da distanza diversa

## 📝 Prossimi passi

Una volta testata, puoi:
1. **Personalizzare** gli stili in `styles.css`
2. **Estendere** la funzionalità in `content.js`
3. **Aggiungere** supporto per altri formati fattura
4. **Integrare** con altri servizi (contabilità, etc.)

## 💡 Suggerimenti sviluppo

Possibili miglioramenti:
- OCR per fatture PDF scannerizzate (tesseract.js)
- Storico pagamenti con localStorage
- Export CSV per contabilità
- Batch processing multi-fattura
- Notifiche scadenze pagamento

## 📞 Debug

Apri DevTools (F12) e controlla:
- Tab **Console** per log ed errori
- Tab **Network** per verificare caricamento risorse
- Tab **Sources** per ispezionare il codice

## ✅ Checklist installazione

- [ ] File estratti in una cartella
- [ ] Chrome aperto su `chrome://extensions/`
- [ ] Modalità sviluppatore attivata
- [ ] Estensione caricata e attiva
- [ ] Test.html aperto e funzionante
- [ ] QR code generato con successo
- [ ] Testato su Gmail (opzionale)

## 🎉 Pronto all'uso!

L'estensione è ora installata e pronta. Buoni pagamenti! 💳

---

**Note**: Questa è una versione base. L'estensione può essere estesa e personalizzata secondo le tue esigenze specifiche.

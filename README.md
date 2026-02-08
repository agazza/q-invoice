# Italian Invoice QR Payment - Chrome Extension

Estensione Chrome per generare QR code di pagamento da fatture elettroniche italiane (FatturaPA) in Gmail e Google Drive.

## 🎯 Funzionalità

- **Parsing automatico** di fatture elettroniche italiane (formato FatturaPA XML)
- **Generazione QR code EPC** per pagamenti SEPA
- **Integrazione con Gmail** - rileva allegati fattura nelle email
- **Integrazione con Google Drive** - lavora con file su Drive
- **Supporto drag & drop** - trascina file XML o PDF ovunque sulla pagina

## 📋 Requisiti

- Google Chrome o browser basato su Chromium (Edge, Brave, etc.)
- Fatture elettroniche italiane in formato XML (o PDF contenenti XML embedded)

## 🚀 Installazione

### Metodo 1: Caricamento manuale (Developer Mode)

1. **Scarica l'estensione**
   - Scarica tutti i file in una cartella locale

2. **Abilita Developer Mode in Chrome**
   - Apri Chrome e vai a `chrome://extensions/`
   - Attiva "Modalità sviluppatore" (Developer mode) in alto a destra

3. **Carica l'estensione**
   - Clicca "Carica estensione non pacchettizzata" (Load unpacked)
   - Seleziona la cartella contenente i file dell'estensione
   - L'estensione verrà installata e attivata

4. **Verifica installazione**
   - Dovresti vedere l'icona dell'estensione nella barra degli strumenti
   - L'estensione è ora attiva su Gmail e Google Drive

## 📖 Come usare

### Su Gmail

1. Apri una email con allegata una fattura elettronica (file .xml o .pdf)
2. Accanto all'allegato vedrai il pulsante **"💳 Genera QR Pagamento"**
3. Clicca il pulsante
4. Si aprirà un popup con:
   - Dettagli del pagamento (beneficiario, IBAN, importo, causale)
   - QR code pronto per essere scansionato
5. Usa l'app della tua banca per scansionare il QR code e completare il pagamento

### Su Google Drive

1. Naviga fino al file della fattura su Google Drive
2. Il pulsante "Genera QR Pagamento" apparirà nel pannello dettagli
3. Per ora, scarica il file e trascinalo sulla pagina web

### Drag & Drop

1. Scarica la fattura XML o PDF sul tuo computer
2. Trascina il file su qualsiasi pagina Gmail o Drive dove l'estensione è attiva
3. Il QR code verrà generato automaticamente

## 🔧 Struttura del progetto

```
invoice-qr-extension/
├── manifest.json          # Configurazione estensione
├── content.js            # Script principale
├── styles.css            # Stili UI
├── qrcode.min.js         # Libreria QR code
├── icon16.png            # Icona 16x16
├── icon48.png            # Icona 48x48
├── icon128.png           # Icona 128x128
└── README.md             # Questo file
```

## 📝 Formato QR Code (EPC)

L'estensione genera QR code nel formato **EPC (European Payments Council)** per bonifici SEPA, compatibile con la maggior parte delle app di home banking italiane.

Struttura del QR code:
```
BCD                           # Service Tag
002                           # Versione
1                             # Character set (UTF-8)
SCT                           # SEPA Credit Transfer
                              # BIC (opzionale)
[Nome Beneficiario]           # Max 70 caratteri
[IBAN]                        # Formato IT standard
EUR[Importo]                  # Es: EUR123.45
                              # Purpose code (opzionale)
[Causale]                     # Max 140 caratteri
```

## 🔍 Dati estratti dalla fattura

L'estensione estrae automaticamente:

- **Beneficiario**: Nome/denominazione del cedente/prestatore
- **IBAN**: Coordinate bancarie per il pagamento
- **Importo**: Totale fattura (con priorità a ImportoPagamento)
- **Causale**: Numero e data fattura, o causale specifica

## ⚠️ Limitazioni attuali

1. **Fatture PDF**: L'estrazione da PDF funziona solo se contengono XML embedded
2. **Google Drive**: Funzionalità limitata, richiede download manuale
3. **Validazione**: L'estensione non valida la correttezza dei dati estratti
4. **Single parsing**: Elabora una fattura alla volta

## 🔐 Privacy e Sicurezza

- ✅ L'estensione **NON invia dati** a server esterni
- ✅ Tutto il processing avviene **localmente** nel browser
- ✅ **Nessuna raccolta** di informazioni personali o finanziarie
- ✅ Permessi minimi richiesti (solo Gmail e Drive)

## 🐛 Debug

Per vedere log di debug:
1. Apri DevTools (F12)
2. Vai alla tab Console
3. Cerca messaggi che iniziano con "FatturaPA", "Error parsing", etc.

## 📞 Supporto

Se riscontri problemi:
1. Verifica che la fattura sia in formato XML FatturaPA valido
2. Controlla la console del browser per errori
3. Assicurati che l'estensione sia abilitata su Gmail/Drive

## 🔄 Sviluppi futuri

Possibili miglioramenti:
- [ ] OCR per fatture PDF scannerizzate
- [ ] Supporto per formati fattura alternativi
- [ ] Storico pagamenti e tracking
- [ ] Export dati per contabilità
- [ ] Integrazione diretta con API bancarie
- [ ] Supporto multi-fattura (batch processing)

## 📄 Licenza

Questo progetto è fornito "as-is" per uso personale e solo per uso non commerciale, secondo la licenza GPM V3.0.

## 🇮🇹 Made for Italy

Questa estensione è specificamente progettata per il sistema di fatturazione elettronica italiano (FatturaPA) e supporta i bonifici SEPA secondo gli standard europei.

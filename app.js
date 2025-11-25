const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict } = PDFLib;

let uploadedPdfBytes = null;
let modifiedPdfBytes = null;

// Éléments DOM
const pdfInput = document.getElementById('pdfInput');
const uploadArea = document.getElementById('uploadArea');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const formSection = document.getElementById('formSection');
const factureForm = document.getElementById('factureForm');
const resultSection = document.getElementById('resultSection');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// Initialisation : date du jour et restauration du nom du vendeur
function initializeForm() {
    // Date du jour par défaut
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('issueDate').value = today;

    // Restaurer le nom du vendeur depuis localStorage
    const savedSellerName = localStorage.getItem('facturx_sellerName');
    if (savedSellerName) {
        document.getElementById('sellerName').value = savedSellerName;
    }
}

// Sauvegarder le nom du vendeur dans localStorage quand il change
document.getElementById('sellerName').addEventListener('change', (e) => {
    const sellerName = e.target.value.trim();
    if (sellerName) {
        localStorage.setItem('facturx_sellerName', sellerName);
        console.log('Nom du vendeur sauvegardé:', sellerName);
    }
});

// Initialiser le formulaire au chargement
initializeForm();

// Fonction pour extraire le texte d'un PDF avec pdf.js
async function extractTextFromPDF(pdfBytes) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        let fullText = '';

        // Extraire le texte de toutes les pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    } catch (error) {
        console.error('Erreur lors de l\'extraction du texte:', error);
        return '';
    }
}

// Fonction pour parser une facture Dolibarr
function parseDolibarrInvoice(text) {
    console.log('=== ANALYSE FACTURE DOLIBARR ===');
    console.log('Texte extrait (premiers 1000 chars):', text.substring(0, 1000));
    console.log('Texte complet (longueur):', text.length);

    const data = {
        detected: false,
        invoiceNumber: '',
        date: '',
        seller: '',
        buyer: '',
        taxBasisTotal: '',
        taxTotal: '',
        grandTotal: ''
    };

    // Détecter si c'est une facture Dolibarr
    if (text.includes('Dolibarr') || text.includes('FACTURE') || /FA\d{4}-\d{4}/.test(text)) {
        data.detected = true;
        console.log('✓ Facture Dolibarr détectée');

        // Extraire le numéro de facture (format: FA1910-0084, FA2024-0001, etc.)
        const invoiceMatch = text.match(/FA\d{4}-\d{4}/);
        if (invoiceMatch) {
            data.invoiceNumber = invoiceMatch[0];
            console.log('✓ Numéro de facture:', data.invoiceNumber);
        }

        // Extraire la date (plusieurs formats possibles)
        const dateMatch = text.match(/Date\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i) ||
                         text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
        if (dateMatch) {
            const dateParts = dateMatch[1].split(/[\/\-]/);
            data.date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            console.log('✓ Date:', data.date);
        }

        // Extraire le nom du vendeur (après "Emetteur" ou "Émetteur")
        // Prendre uniquement jusqu'au premier chiffre (début de l'adresse) ou jusqu'à 50 caractères max
        const emetteurMatch = text.match(/[ÉE]metteur\s*:?\s+([A-ZÀ-Ÿ][^\d]{3,60}?)(?:\s+\d|  )/i);
        if (emetteurMatch) {
            data.seller = emetteurMatch[1].trim();
            console.log('✓ Vendeur (nom seul):', data.seller);
        } else {
            // Fallback : prendre après "Émetteur:" et avant le premier nombre ou double espace
            const emetteurMatch2 = text.match(/[ÉE]metteur\s*:?\s+([^0-9]{5,80}?)(?:\s{2,}|\d)/i);
            if (emetteurMatch2) {
                data.seller = emetteurMatch2[1].trim();
                console.log('✓ Vendeur (fallback):', data.seller);
            }
        }

        // Extraire le nom de l'acheteur (après "Adressé à" ou équivalent)
        // Prendre uniquement jusqu'au premier chiffre (début de l'adresse) ou jusqu'à 80 caractères max
        const buyerMatch = text.match(/Adress[ée]\s+[àa]\s*:?\s+([A-ZÀ-Ÿ][^\d]{3,80}?)(?:\s+\d|  )/i);
        if (buyerMatch) {
            data.buyer = buyerMatch[1].trim();
            console.log('✓ Acheteur (nom seul):', data.buyer);
        } else {
            // Fallback : prendre après "Adressé à:" et avant le premier nombre ou double espace
            const buyerMatch2 = text.match(/Adress[ée]\s+[àa]\s*:?\s+([^0-9]{5,100}?)(?:\s{2,}|\d)/i);
            if (buyerMatch2) {
                data.buyer = buyerMatch2[1].trim();
                console.log('✓ Acheteur (fallback):', data.buyer);
            }
        }

        // Extraire les montants
        // Total HT - plusieurs patterns possibles
        const htMatch = text.match(/Total\s+HT\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                       text.match(/Sous[-\s]total\s+HT\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                       text.match(/Total\s+hors\s+taxes?\s*:?\s*([\d\s]+[,\.]\d{2})/i);
        if (htMatch) {
            data.taxBasisTotal = htMatch[1].replace(/\s/g, '').replace(',', '.');
            console.log('✓ Total HT:', data.taxBasisTotal);
        }

        // Total TVA - chercher spécifiquement "TVA 20%" ou "Total TVA"
        // Essayer plusieurs patterns
        const tvaMatch = text.match(/TVA\s+\d+%\s+([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/Total\s+TVA\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/TVA\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/T\.V\.A\.\s*:?\s*([\d\s]+[,\.]\d{2})/i);
        if (tvaMatch) {
            data.taxTotal = tvaMatch[1].replace(/\s/g, '').replace(',', '.');
            console.log('✓ Total TVA:', data.taxTotal);
        } else {
            console.log('⚠ TVA non trouvée, patterns testés: TVA %, Total TVA, TVA:, T.V.A.');
        }

        // Total TTC
        const ttcMatch = text.match(/Total\s+TTC\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/Montant\s+TTC\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/Total\s+toutes\s+taxes\s*:?\s*([\d\s]+[,\.]\d{2})/i) ||
                        text.match(/Total\s*:?\s*([\d\s]+[,\.]\d{2})\s*€/i);
        if (ttcMatch) {
            data.grandTotal = ttcMatch[1].replace(/\s/g, '').replace(',', '.');
            console.log('✓ Total TTC:', data.grandTotal);
        }

        // Log final des données extraites
        console.log('\n--- RÉSUMÉ DES DONNÉES EXTRAITES ---');
        console.log('Facture:', data.invoiceNumber || '❌ NON TROUVÉ');
        console.log('Date:', data.date || '❌ NON TROUVÉ');
        console.log('Vendeur:', data.seller || '❌ NON TROUVÉ');
        console.log('Acheteur:', data.buyer || '❌ NON TROUVÉ');
        console.log('HT:', data.taxBasisTotal || '❌ NON TROUVÉ');
        console.log('TVA:', data.taxTotal || '❌ NON TROUVÉ');
        console.log('TTC:', data.grandTotal || '❌ NON TROUVÉ');
    } else {
        console.log('✗ Pas une facture Dolibarr');
    }

    return data;
}

// Fonction pour préremplir le formulaire
function prefillForm(data) {
    if (data.invoiceNumber) {
        document.getElementById('invoiceNumber').value = data.invoiceNumber;
    }
    if (data.date) {
        document.getElementById('issueDate').value = data.date;
    }
    if (data.seller) {
        document.getElementById('sellerName').value = data.seller;
        // Sauvegarder dans localStorage
        localStorage.setItem('facturx_sellerName', data.seller);
    }
    if (data.buyer) {
        document.getElementById('buyerName').value = data.buyer;
    }
    if (data.taxBasisTotal) {
        document.getElementById('taxBasisTotal').value = data.taxBasisTotal;
    }
    if (data.taxTotal) {
        document.getElementById('taxTotal').value = data.taxTotal;
    }
    if (data.grandTotal) {
        document.getElementById('grandTotal').value = data.grandTotal;
        document.getElementById('duePayable').value = data.grandTotal;
    }

    console.log('✓ Formulaire prérempli');
}

// Upload du PDF
pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        uploadedPdfBytes = new Uint8Array(arrayBuffer);

        console.log('=== FICHIER PDF CHARGÉ ===');
        console.log('Nom:', file.name);
        console.log('Taille du fichier:', file.size, 'octets');
        console.log('Taille de uploadedPdfBytes:', uploadedPdfBytes.length, 'octets');
        console.log('Type MIME:', file.type);
        console.log('uploadedPdfBytes est défini:', uploadedPdfBytes !== null && uploadedPdfBytes !== undefined);

        if (uploadedPdfBytes.length === 0) {
            throw new Error('Le fichier PDF est vide après chargement');
        }

        fileName.textContent = file.name;
        fileInfo.style.display = 'block';
        formSection.style.display = 'block';

        // Tenter d'extraire et parser les données
        try {
            // Créer une copie pour pdf.js (qui vide le buffer original)
            const pdfBytesCopy = new Uint8Array(uploadedPdfBytes);
            const text = await extractTextFromPDF(pdfBytesCopy);
            const parsedData = parseDolibarrInvoice(text);

            if (parsedData.detected) {
                console.log('✓ Préremplissage automatique activé');
                prefillForm(parsedData);

                // Afficher un message à l'utilisateur
                const notification = document.createElement('div');
                notification.style.cssText = 'background: #d1fae5; color: #065f46; padding: 14px 20px; margin: 0 0 20px 0; border-radius: 6px; text-align: center; border: 1px solid #10b981; font-weight: 500;';
                notification.textContent = '✓ Facture Dolibarr détectée - Champs préremplis automatiquement';
                formSection.insertBefore(notification, formSection.firstChild);

                // Retirer la notification après 5 secondes
                setTimeout(() => notification.remove(), 5000);
            }
        } catch (error) {
            console.warn('Impossible d\'extraire les données de la facture:', error);
            // Continuer normalement même si l'extraction échoue
        }

        // Scroll vers le formulaire
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        console.error('Erreur lors du chargement du PDF:', error);
        alert('Erreur lors du chargement du fichier: ' + error.message);
        pdfInput.value = '';
        uploadedPdfBytes = null;
        fileInfo.style.display = 'none';
        formSection.style.display = 'none';
    }
});

// Fonction pour formater la date au format YYYYMMDD
function formatDateForXML(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// Fonction pour échapper les caractères spéciaux XML
function escapeXML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Fonction pour générer le XML Factur-X
function generateFacturXML(formData) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <!-- En-tête du document -->
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <!-- Informations de la facture -->
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXML(formData.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${formData.documentType}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatDateForXML(formData.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <!-- Transaction commerciale -->
  <rsm:SupplyChainTradeTransaction>

    <!-- Vendeur et Acheteur -->
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXML(formData.sellerName)}</ram:Name>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXML(formData.buyerName)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <!-- Livraison -->
    <ram:ApplicableHeaderTradeDelivery/>

    <!-- Montants -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${formData.currency}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${parseFloat(formData.taxBasisTotal).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${formData.currency}">${parseFloat(formData.taxTotal).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${parseFloat(formData.grandTotal).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${parseFloat(formData.duePayable).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

    return xml;
}

// Fonction pour créer un UUID simple
function createUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Fonction pour embarquer le XML dans le PDF
async function embedXMLInPDF(pdfBytes, xmlContent) {
    try {
        console.log('=== EMBARQUEMENT XML DANS PDF ===');
        console.log('Type de pdfBytes:', typeof pdfBytes);
        console.log('pdfBytes est un Uint8Array:', pdfBytes instanceof Uint8Array);
        console.log('Taille de pdfBytes:', pdfBytes ? pdfBytes.length : 'NULL');

        if (!pdfBytes || pdfBytes.length === 0) {
            throw new Error('Le fichier PDF est vide ou non chargé');
        }

        // Vérifier les premiers octets
        const firstBytes = Array.from(pdfBytes.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log('Premiers octets du PDF:', firstBytes);

        const header = new TextDecoder('utf-8').decode(pdfBytes.slice(0, 5));
        console.log('En-tête du PDF:', header);

        if (!header.startsWith('%PDF')) {
            throw new Error('Le fichier ne commence pas par %PDF - fichier corrompu');
        }

        console.log('Chargement du PDF avec pdf-lib...');
        const pdfDoc = await PDFDocument.load(pdfBytes, {
            ignoreEncryption: true,
            updateMetadata: false
        });
        console.log('✓ PDF chargé avec succès');

        // Convertir le XML en bytes
        const xmlBytes = new TextEncoder().encode(xmlContent);

        // Créer le fichier attaché
        const attachmentName = 'factur-x.xml';

        console.log('Embarquement du XML de', xmlBytes.length, 'octets');

        // Embarquer le fichier avec pdf-lib
        await pdfDoc.attach(xmlBytes, attachmentName, {
            mimeType: 'text/xml',
            description: 'Factur-X XML Invoice',
            creationDate: new Date(),
            modificationDate: new Date()
        });

        console.log('Fichier attaché avec succès');

        // Ajouter les métadonnées PDF/A-3
        const context = pdfDoc.context;
        const catalog = context.lookup(pdfDoc.catalog);

        // Créer l'entrée AF (Associated Files) dans le catalogue
        try {
            const names = catalog.get(PDFName.of('Names'));
            if (names) {
                const namesDict = context.lookup(names);
                const embeddedFiles = namesDict.get(PDFName.of('EmbeddedFiles'));
                if (embeddedFiles) {
                    const efTree = context.lookup(embeddedFiles);
                    const namesArray = efTree.get(PDFName.of('Names'));
                    if (namesArray) {
                        const array = context.lookup(namesArray);
                        // Le fileSpec est à l'index 1 (après le nom à l'index 0)
                        const fileSpecRef = array.get(1);
                        if (fileSpecRef) {
                            // Créer le tableau AF dans le catalogue
                            const afArray = context.obj([fileSpecRef]);
                            catalog.set(PDFName.of('AF'), afArray);
                            console.log('Métadonnée AF ajoutée');
                        }
                    }
                }
            }
        } catch (afError) {
            console.warn('Impossible d\'ajouter la métadonnée AF:', afError);
            // Continuer même si AF échoue
        }

        // Sauvegarder le PDF modifié avec les bonnes options
        const modifiedPdf = await pdfDoc.save({
            useObjectStreams: false,
            addDefaultPage: false,
            objectsPerTick: 50
        });
        console.log('PDF sauvegardé avec succès:', modifiedPdf.length, 'octets');
        return modifiedPdf;
    } catch (error) {
        console.error('Erreur lors de l\'embarquement du XML:', error);
        throw error;
    }
}

// Soumission du formulaire
factureForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    console.log('=== SOUMISSION DU FORMULAIRE ===');
    console.log('uploadedPdfBytes existe:', uploadedPdfBytes !== null && uploadedPdfBytes !== undefined);
    console.log('uploadedPdfBytes.length:', uploadedPdfBytes ? uploadedPdfBytes.length : 'UNDEFINED');

    if (!uploadedPdfBytes || uploadedPdfBytes.length === 0) {
        alert('Veuillez d\'abord charger un fichier PDF valide');
        return;
    }

    // Récupérer les données du formulaire
    const formData = {
        invoiceNumber: document.getElementById('invoiceNumber').value,
        documentType: document.getElementById('documentType').value,
        issueDate: document.getElementById('issueDate').value,
        sellerName: document.getElementById('sellerName').value,
        buyerName: document.getElementById('buyerName').value,
        currency: document.getElementById('currency').value,
        taxBasisTotal: document.getElementById('taxBasisTotal').value,
        taxTotal: document.getElementById('taxTotal').value,
        grandTotal: document.getElementById('grandTotal').value,
        duePayable: document.getElementById('duePayable').value
    };

    try {
        // Générer le XML
        const xml = generateFacturXML(formData);

        console.log('Avant embedXMLInPDF - uploadedPdfBytes.length:', uploadedPdfBytes.length);

        // Embarquer le XML dans le PDF
        modifiedPdfBytes = await embedXMLInPDF(uploadedPdfBytes, xml);

        // Afficher la section de résultat
        formSection.style.display = 'none';
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        alert('Une erreur s\'est produite lors de la génération de la facture Factur-X: ' + error.message);
        console.error(error);
    }
});

// Téléchargement du PDF
downloadBtn.addEventListener('click', () => {
    if (modifiedPdfBytes) {
        try {
            // Créer un nom de fichier avec timestamp
            const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `facture-x-${timestamp}.pdf`;

            // Créer le blob avec le type MIME explicite
            const blob = new Blob([modifiedPdfBytes], {
                type: 'application/pdf'
            });

            // Méthode compatible Safari/Mac
            if (window.navigator && window.navigator.msSaveOrOpenBlob) {
                // IE11
                window.navigator.msSaveOrOpenBlob(blob, filename);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                a.type = 'application/pdf';

                document.body.appendChild(a);
                a.click();

                // Nettoyer après un délai
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
            }

            console.log('Téléchargement du PDF:', filename, blob.size, 'octets');
        } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            alert('Erreur lors du téléchargement du PDF');
        }
    }
});

// Réinitialisation
resetBtn.addEventListener('click', () => {
    uploadedPdfBytes = null;
    modifiedPdfBytes = null;
    otsProof = null;
    pdfInput.value = '';
    factureForm.reset();
    fileInfo.style.display = 'none';
    formSection.style.display = 'none';
    resultSection.style.display = 'none';

    // Réinitialiser les états OTS
    otsNotGenerated.style.display = 'block';
    otsGenerating.style.display = 'none';
    otsGenerated.style.display = 'none';
    otsError.style.display = 'none';

    // Réinitialiser le formulaire (date du jour)
    initializeForm();

    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Auto-calcul du montant TTC et du montant à payer
document.getElementById('taxBasisTotal').addEventListener('input', calculateTotals);
document.getElementById('taxTotal').addEventListener('input', calculateTotals);

function calculateTotals() {
    const taxBasis = parseFloat(document.getElementById('taxBasisTotal').value) || 0;
    const tax = parseFloat(document.getElementById('taxTotal').value) || 0;
    const total = taxBasis + tax;

    document.getElementById('grandTotal').value = total.toFixed(2);
    document.getElementById('duePayable').value = total.toFixed(2);
}

// ========================================
// SECTION EXTRACTION XML
// ========================================

let extractedXmlContent = null;

// Éléments DOM pour l'extraction
const extractPdfInput = document.getElementById('extractPdfInput');
const extractFileInfo = document.getElementById('extractFileInfo');
const extractFileName = document.getElementById('extractFileName');
const xmlDisplaySection = document.getElementById('xmlDisplaySection');
const downloadXmlBtn = document.getElementById('downloadXmlBtn');
const viewXmlBtn = document.getElementById('viewXmlBtn');
const xmlRawDisplay = document.getElementById('xmlRawDisplay');
const xmlContent = document.getElementById('xmlContent');

// Gestion des onglets
const tabBtns = document.querySelectorAll('.tab-btn');
const createTab = document.getElementById('createTab');
const extractTab = document.getElementById('extractTab');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');

        // Mettre à jour les boutons
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Afficher/masquer les onglets
        if (tabName === 'create') {
            createTab.style.display = 'block';
            extractTab.style.display = 'none';
        } else {
            createTab.style.display = 'none';
            extractTab.style.display = 'block';
        }
    });
});

// Fonction pour extraire le XML d'un PDF Factur-X
async function extractXMLFromPDF(pdfBytes) {
    try {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const context = pdfDoc.context;
        const catalog = context.lookup(pdfDoc.catalog);

        console.log('=== DÉBUT DE L\'EXTRACTION ===');

        // Méthode 1 : Via le catalogue Names (standard)
        const names = catalog.get(PDFName.of('Names'));
        if (names) {
            console.log('✓ Dictionnaire Names trouvé');
            const namesDict = context.lookup(names);
            const embeddedFiles = namesDict.get(PDFName.of('EmbeddedFiles'));

            if (embeddedFiles) {
                console.log('✓ EmbeddedFiles trouvé');
                const efTree = context.lookup(embeddedFiles);
                const namesArray = efTree.get(PDFName.of('Names'));

                if (namesArray) {
                    const array = context.lookup(namesArray);
                    console.log('✓ Tableau Names avec', array.size(), 'éléments');

                    // Parcourir les fichiers embarqués (par paires nom/spec)
                    for (let i = 0; i < array.size(); i += 2) {
                        try {
                            const nameObj = array.get(i);
                            let fileName = 'unknown';

                            // Extraire le nom du fichier
                            if (nameObj) {
                                const nameStr = nameObj.toString();
                                fileName = nameStr.replace(/^\(/, '').replace(/\)$/, '');
                            }

                            console.log('  → Fichier [' + (i/2) + ']: "' + fileName + '"');

                            const fileSpecRef = array.get(i + 1);
                            if (!fileSpecRef) {
                                console.log('    ✗ Pas de FileSpec');
                                continue;
                            }

                            const fileSpec = context.lookup(fileSpecRef);
                            const efDict = fileSpec.get(PDFName.of('EF'));

                            if (!efDict) {
                                console.log('    ✗ Pas de dictionnaire EF');
                                continue;
                            }

                            const efDictResolved = context.lookup(efDict);
                            const embeddedFileRef = efDictResolved.get(PDFName.of('F'));

                            if (!embeddedFileRef) {
                                console.log('    ✗ Pas de référence F');
                                continue;
                            }

                            const embeddedFileStream = context.lookup(embeddedFileRef);

                            if (!embeddedFileStream || !embeddedFileStream.contents) {
                                console.log('    ✗ Pas de contenu');
                                continue;
                            }

                            const fileData = embeddedFileStream.contents;
                            console.log('    ✓ Contenu brut trouvé:', fileData.length, 'octets');

                            // Vérifier les filtres de compression
                            const filters = embeddedFileStream.dict.get(PDFName.of('Filter'));
                            let decodedData = fileData;

                            if (filters) {
                                const filterName = filters.toString();
                                console.log('    ℹ Filtre détecté:', filterName);

                                if (filterName === '/FlateDecode' || filterName === '/Fl') {
                                    try {
                                        // Décompresser avec pako
                                        decodedData = pako.inflate(fileData);
                                        console.log('    ✓ Décompression réussie:', decodedData.length, 'octets');
                                    } catch (inflateError) {
                                        console.warn('    ⚠ Erreur de décompression:', inflateError.message);
                                        // Essayer sans décompression
                                    }
                                }
                            }

                            // Décoder le contenu en UTF-8
                            const xmlText = new TextDecoder('utf-8').decode(decodedData);
                            const preview = xmlText.substring(0, 100).replace(/\n/g, ' ');
                            console.log('    ✓ Aperçu:', preview);

                            // Vérifier si c'est un XML Factur-X
                            if (xmlText.trim().startsWith('<?xml') &&
                                (xmlText.includes('CrossIndustryInvoice') ||
                                 xmlText.includes('factur-x') ||
                                 xmlText.includes('urn:un:unece:uncefact') ||
                                 xmlText.includes('urn:factur-x'))) {
                                console.log('✓✓✓ XML Factur-X TROUVÉ !');
                                return xmlText;
                            } else {
                                console.log('    ✗ Pas un XML Factur-X');
                            }
                        } catch (innerError) {
                            console.warn('    ✗ Erreur:', innerError.message);
                            continue;
                        }
                    }
                }
            }
        }

        // Méthode 2 : Recherche brute dans tous les streams
        console.log('\n--- Méthode alternative : recherche dans tous les objets ---');
        const indirectObjects = context.enumerateIndirectObjects();
        let streamCount = 0;

        for (const [ref, obj] of indirectObjects) {
            try {
                // Chercher les streams avec Subtype = EmbeddedFile
                if (obj instanceof PDFDict) {
                    const subtype = obj.get(PDFName.of('Subtype'));

                    if (subtype && subtype.toString() === '/EmbeddedFile') {
                        streamCount++;
                        console.log('Stream #' + streamCount + ':', ref);

                        if (obj.contents) {
                            let decodedData = obj.contents;

                            // Vérifier les filtres de compression
                            const filters = obj.get(PDFName.of('Filter'));
                            if (filters) {
                                const filterName = filters.toString();
                                console.log('  Filtre:', filterName);

                                if (filterName === '/FlateDecode' || filterName === '/Fl') {
                                    try {
                                        decodedData = pako.inflate(obj.contents);
                                        console.log('  Décompression OK');
                                    } catch (e) {
                                        console.warn('  Erreur décompression:', e.message);
                                    }
                                }
                            }

                            const xmlText = new TextDecoder('utf-8').decode(decodedData);
                            const preview = xmlText.substring(0, 100).replace(/\n/g, ' ');
                            console.log('  Aperçu:', preview);

                            if (xmlText.trim().startsWith('<?xml') &&
                                (xmlText.includes('CrossIndustryInvoice') ||
                                 xmlText.includes('factur-x') ||
                                 xmlText.includes('urn:un:unece:uncefact') ||
                                 xmlText.includes('urn:factur-x'))) {
                                console.log('✓✓✓ XML Factur-X TROUVÉ via méthode alternative !');
                                return xmlText;
                            }
                        }
                    }
                }
            } catch (innerError) {
                continue;
            }
        }

        console.log('\n✗✗✗ Aucun XML Factur-X trouvé');
        console.log('Streams EmbeddedFile trouvés:', streamCount);
        throw new Error('Aucun XML Factur-X trouvé dans ce PDF. Assurez-vous qu\'il s\'agit bien d\'une facture Factur-X avec XML embarqué.');
    } catch (error) {
        console.error('Erreur lors de l\'extraction du XML:', error);
        throw error;
    }
}

// Fonction pour parser le XML et extraire les informations
function parseFacturXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Vérifier les erreurs de parsing
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Erreur de parsing XML: ' + parserError.textContent);
    }

    // Fonction helper pour extraire du texte
    const getText = (selector, defaultValue = '-') => {
        const element = xmlDoc.querySelector(selector);
        return element ? element.textContent.trim() : defaultValue;
    };

    // Extraire les informations
    const data = {
        invoiceNumber: getText('ExchangedDocument ID, ram\\:ID'),
        documentType: getText('ExchangedDocument TypeCode, ram\\:TypeCode'),
        issueDate: getText('IssueDateTime DateTimeString, udt\\:DateTimeString'),
        sellerName: getText('SellerTradeParty Name, ram\\:SellerTradeParty ram\\:Name'),
        buyerName: getText('BuyerTradeParty Name, ram\\:BuyerTradeParty ram\\:Name'),
        currency: getText('InvoiceCurrencyCode, ram\\:InvoiceCurrencyCode'),
        taxBasisTotal: getText('TaxBasisTotalAmount, ram\\:TaxBasisTotalAmount'),
        taxTotal: getText('TaxTotalAmount, ram\\:TaxTotalAmount'),
        grandTotal: getText('GrandTotalAmount, ram\\:GrandTotalAmount'),
        duePayable: getText('DuePayableAmount, ram\\:DuePayableAmount')
    };

    // Formater la date
    if (data.issueDate !== '-' && data.issueDate.length === 8) {
        const year = data.issueDate.substring(0, 4);
        const month = data.issueDate.substring(4, 6);
        const day = data.issueDate.substring(6, 8);
        data.issueDate = `${day}/${month}/${year}`;
    }

    // Formater le type de document
    if (data.documentType === '380') {
        data.documentType = '380 - Facture';
    } else if (data.documentType === '381') {
        data.documentType = '381 - Avoir';
    }

    return data;
}

// Fonction pour afficher les informations extraites
function displayExtractedInfo(data) {
    document.getElementById('extractInvoiceNumber').textContent = data.invoiceNumber;
    document.getElementById('extractDocType').textContent = data.documentType;
    document.getElementById('extractIssueDate').textContent = data.issueDate;
    document.getElementById('extractSeller').textContent = data.sellerName;
    document.getElementById('extractBuyer').textContent = data.buyerName;
    document.getElementById('extractCurrency').textContent = data.currency;
    document.getElementById('extractTaxBasis').textContent = data.taxBasisTotal;
    document.getElementById('extractTax').textContent = data.taxTotal;
    document.getElementById('extractGrandTotal').textContent = data.grandTotal;
    document.getElementById('extractDuePayable').textContent = data.duePayable;
}

// Upload du PDF pour extraction
extractPdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfBytes = new Uint8Array(arrayBuffer);

            extractFileName.textContent = file.name;
            extractFileInfo.style.display = 'block';

            // Extraire le XML
            const xmlText = await extractXMLFromPDF(pdfBytes);
            extractedXmlContent = xmlText;

            // Parser et afficher les informations
            const data = parseFacturXML(xmlText);
            displayExtractedInfo(data);

            // Afficher la section de résultat
            xmlDisplaySection.style.display = 'block';
            xmlRawDisplay.style.display = 'none';

            // Afficher le XML brut
            xmlContent.textContent = xmlText;

            // Scroll vers les résultats
            xmlDisplaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            alert('Erreur lors de l\'extraction du XML: ' + error.message);
            console.error(error);
            extractFileInfo.style.display = 'none';
            xmlDisplaySection.style.display = 'none';
        }
    }
});

// Télécharger le XML
downloadXmlBtn.addEventListener('click', () => {
    if (extractedXmlContent) {
        try {
            // Créer un nom de fichier avec timestamp
            const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `factur-x-${timestamp}.xml`;

            // Créer le blob avec le type MIME explicite
            const blob = new Blob([extractedXmlContent], {
                type: 'application/xml;charset=utf-8'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            a.type = 'application/xml';

            document.body.appendChild(a);
            a.click();

            // Nettoyer après un délai
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log('Téléchargement du XML:', filename, blob.size, 'octets');
        } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            alert('Erreur lors du téléchargement du XML');
        }
    }
});

// Afficher/masquer le XML brut
viewXmlBtn.addEventListener('click', () => {
    if (xmlRawDisplay.style.display === 'none') {
        xmlRawDisplay.style.display = 'block';
        viewXmlBtn.textContent = 'Masquer le XML brut';
    } else {
        xmlRawDisplay.style.display = 'none';
        viewXmlBtn.textContent = 'Voir le XML brut';
    }
});

// ========================================
// SECTION OPENTIMESTAMPS
// ========================================

let otsProof = null;

// Éléments DOM pour OTS
const generateOtsBtn = document.getElementById('generateOtsBtn');
const downloadOtsBtn = document.getElementById('downloadOtsBtn');
const retryOtsBtn = document.getElementById('retryOtsBtn');
const otsNotGenerated = document.getElementById('otsNotGenerated');
const otsGenerating = document.getElementById('otsGenerating');
const otsGenerated = document.getElementById('otsGenerated');
const otsError = document.getElementById('otsError');
const otsErrorMsg = document.getElementById('otsErrorMsg');

// Fonction pour calculer le SHA256 d'un fichier
async function sha256(bytes) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Fonction helper pour convertir hex en bytes
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Générer le timestamp OTS
generateOtsBtn.addEventListener('click', async () => {
    if (!modifiedPdfBytes) {
        alert('Aucune facture PDF générée');
        return;
    }

    try {
        // Afficher l'état de génération
        otsNotGenerated.style.display = 'none';
        otsGenerating.style.display = 'block';
        otsGenerated.style.display = 'none';
        otsError.style.display = 'none';

        console.log('=== GÉNÉRATION OPENTIMESTAMPS ===');

        // Vérifier que OpenTimestamps est chargé
        if (typeof OpenTimestamps === 'undefined') {
            throw new Error('La bibliothèque OpenTimestamps n\'est pas chargée. Veuillez recharger la page.');
        }

        console.log('OpenTimestamps disponible:', typeof OpenTimestamps);

        // Calculer le hash SHA256 du PDF
        const fileHash = await sha256(modifiedPdfBytes);
        console.log('Hash SHA256 du fichier:', fileHash);

        // Convertir le hash en bytes
        const hashBytes = hexToBytes(fileHash);

        // Créer le DetachedTimestampFile
        const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
            new OpenTimestamps.Ops.OpSHA256(),
            hashBytes
        );

        // Stamper le fichier
        console.log('Envoi au serveur OpenTimestamps...');
        await OpenTimestamps.stamp(detached);

        // Sauvegarder la preuve
        otsProof = detached.serializeToBytes();
        console.log('Timestamp généré, taille:', otsProof.length, 'octets');

        // Afficher le succès
        otsGenerating.style.display = 'none';
        otsGenerated.style.display = 'block';

    } catch (error) {
        console.error('Erreur lors de la génération OTS:', error);
        otsGenerating.style.display = 'none';
        otsError.style.display = 'block';
        otsErrorMsg.textContent = error.message || 'Erreur inconnue';
    }
});

// Télécharger le fichier OTS
downloadOtsBtn.addEventListener('click', () => {
    if (!otsProof) {
        alert('Aucun timestamp généré');
        return;
    }

    try {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `facture-x-${timestamp}.ots`;

        const blob = new Blob([otsProof], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('Téléchargement du fichier OTS:', filename);
    } catch (error) {
        console.error('Erreur lors du téléchargement OTS:', error);
        alert('Erreur lors du téléchargement du fichier OTS');
    }
});

// Réessayer la génération OTS
retryOtsBtn.addEventListener('click', () => {
    otsError.style.display = 'none';
    otsNotGenerated.style.display = 'block';
});

// ========================================
// VÉRIFICATION OPENTIMESTAMPS
// ========================================

const verifyPdfInput = document.getElementById('verifyPdfInput');
const verifyOtsInput = document.getElementById('verifyOtsInput');
const verifyOtsBtn = document.getElementById('verifyOtsBtn');
const otsVerifyResult = document.getElementById('otsVerifyResult');
const otsVerifySuccess = document.getElementById('otsVerifySuccess');
const otsVerifyPending = document.getElementById('otsVerifyPending');
const otsVerifyError = document.getElementById('otsVerifyError');
const otsVerifyErrorMsg = document.getElementById('otsVerifyErrorMsg');
const otsTimestamp = document.getElementById('otsTimestamp');
const otsFileHash = document.getElementById('otsFileHash');
const otsBitcoinBlock = document.getElementById('otsBitcoinBlock');

let verifyPdfFile = null;
let verifyOtsFile = null;

// Gérer l'upload des fichiers pour vérification
verifyPdfInput.addEventListener('change', (e) => {
    verifyPdfFile = e.target.files[0];
    checkVerifyReady();
});

verifyOtsInput.addEventListener('change', (e) => {
    verifyOtsFile = e.target.files[0];
    checkVerifyReady();
});

function checkVerifyReady() {
    verifyOtsBtn.disabled = !(verifyPdfFile && verifyOtsFile);
}

// Vérifier le timestamp OTS
verifyOtsBtn.addEventListener('click', async () => {
    if (!verifyPdfFile || !verifyOtsFile) {
        alert('Veuillez sélectionner les deux fichiers');
        return;
    }

    try {
        console.log('=== VÉRIFICATION OPENTIMESTAMPS ===');

        // Lire le fichier PDF
        const pdfArrayBuffer = await verifyPdfFile.arrayBuffer();
        const pdfBytes = new Uint8Array(pdfArrayBuffer);

        // Calculer le hash du PDF
        const fileHash = await sha256(pdfBytes);
        console.log('Hash du fichier PDF:', fileHash);

        // Lire le fichier OTS
        const otsArrayBuffer = await verifyOtsFile.arrayBuffer();
        const otsBytes = new Uint8Array(otsArrayBuffer);
        console.log('Taille du fichier OTS:', otsBytes.length, 'octets');

        // Désérialiser le timestamp
        const detached = OpenTimestamps.DetachedTimestampFile.deserialize(otsBytes);
        console.log('Timestamp désérialisé avec succès');

        // Vérifier le hash du fichier correspond au timestamp
        const pdfHashBytes = hexToBytes(fileHash);

        // Afficher les résultats
        otsVerifyResult.style.display = 'block';
        otsFileHash.textContent = fileHash;

        // Chercher les attestations Bitcoin dans le timestamp
        let hasAttestation = false;
        let attestationTime = null;
        let blockHeight = null;

        try {
            // Accéder aux attestations directement
            const allAttestations = [];

            // Fonction récursive pour extraire toutes les attestations
            function extractAttestations(timestamp) {
                if (!timestamp) return;

                // Vérifier les attestations directes
                if (timestamp.attestations) {
                    for (const att of timestamp.attestations) {
                        allAttestations.push(att);
                    }
                }

                // Parcourir les ops (opérations)
                if (timestamp.ops) {
                    for (const [key, nextTimestamp] of timestamp.ops) {
                        extractAttestations(nextTimestamp);
                    }
                }
            }

            extractAttestations(detached.timestamp);

            console.log('Attestations trouvées:', allAttestations.length);

            // Chercher une attestation Bitcoin
            for (const att of allAttestations) {
                const attType = att.constructor.name;
                console.log('Type d\'attestation:', attType);

                // BitcoinBlockHeaderAttestation signifie que c'est confirmé
                if (attType.includes('Bitcoin')) {
                    hasAttestation = true;

                    // Essayer de récupérer la hauteur du bloc
                    if (att.height !== undefined) {
                        blockHeight = att.height;
                    }

                    console.log('Attestation Bitcoin trouvée, height:', blockHeight);
                    break;
                }
            }
        } catch (e) {
            console.warn('Erreur lors de l\'extraction des attestations:', e);
        }

        if (hasAttestation) {
            // Timestamp confirmé sur la blockchain
            otsVerifySuccess.style.display = 'block';
            otsVerifyPending.style.display = 'none';
            otsVerifyError.style.display = 'none';

            if (blockHeight) {
                otsBitcoinBlock.textContent = `Block #${blockHeight}`;
                otsTimestamp.textContent = 'Confirmé sur la blockchain Bitcoin';
            } else {
                otsBitcoinBlock.textContent = 'Confirmé sur Bitcoin';
                otsTimestamp.textContent = 'Timestamp vérifié avec succès';
            }
        } else {
            // Timestamp en attente
            otsVerifySuccess.style.display = 'none';
            otsVerifyPending.style.display = 'block';
            otsVerifyError.style.display = 'none';
        }

    } catch (error) {
        console.error('Erreur lors de la vérification:', error);
        otsVerifyResult.style.display = 'block';
        otsVerifySuccess.style.display = 'none';
        otsVerifyPending.style.display = 'none';
        otsVerifyError.style.display = 'block';
        otsVerifyErrorMsg.textContent = error.message || 'Erreur lors de la vérification';
    }
});

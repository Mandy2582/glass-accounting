import { Order } from '@/types';
import { db } from './storage';
import { getAuthHeaders } from './auth';

// Tally API Utility
export const tallyApi = {
    /**
     * Send an XML request to Tally Prime via the Next.js API proxy
     */
    async sendRequest(tallyIp: string, port: string, xmlData: string): Promise<string> {
        const url = `http://${tallyIp}:${port}`;
        const authHeaders = await getAuthHeaders();
        
        const response = await fetch('/api/tally', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
            },
            body: JSON.stringify({
                tallyUrl: url,
                xmlRequest: xmlData
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.details || 'Failed to connect to Tally proxy');
        }

        return await response.text();
    },

    /**
     * Generate Tally XML for a Sales Order
     */
    generateSalesOrderXml(order: Order, companyName: string): string {
        // Tally requires a specific XML structure for vouchers
        const voucherDate = new Date(order.date).toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD
        
        let inventoryEntries = '';
        
        order.items.forEach(item => {
            inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <BILLEDQTY>${item.quantity} ${item.unit}</BILLEDQTY>
                <RATE>${item.rate}/sqft</RATE>
                <AMOUNT>-${item.amount}</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>`;
        });

        const xml = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Sales Order" ACTION="Create" OBJVIEW="Invoice Voucher View">
                        <DATE>${voucherDate}</DATE>
                        <VOUCHERTYPENAME>Sales Order</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${order.number}</VOUCHERNUMBER>
                        <PARTYLEDGERNAME>${escapeXml(order.partyName)}</PARTYLEDGERNAME>
                        <PERSISTEDVIEW>Inv Voucher View</PERSISTEDVIEW>
                        
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${escapeXml(order.partyName)}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-${order.total}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>Sales Account</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${order.subtotal}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        
                        ${inventoryEntries}
                        
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>
        `;

        return xml.trim();
    },

    /**
     * Fetch Stock Items from Tally Prime
     */
    async fetchStockItems(tallyIp: string, port: string, companyName: string): Promise<any[]> {
        const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyStockItemsCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLUSERTDL>
          <COLLECTION NAME="MyStockItemsCollection" TYPE="StockItem">
            <FETCH>Name,BaseUnits,ClosingBalance,OpeningBalance,LastSaleRate,LastPurchaseRate,StandardRate,Description</FETCH>
          </COLLECTION>
        </TDLUSERTDL>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
        `.trim();

        const xmlResponse = await this.sendRequest(tallyIp, port, xmlRequest);
        
        if (typeof window === 'undefined') {
            return parseStockItemsXmlRegex(xmlResponse);
        } else {
            return parseStockItemsXmlDOM(xmlResponse);
        }
    },

    /**
     * Fetch Ledgers (Parties) from Tally Prime
     */
    async fetchLedgers(tallyIp: string, port: string, companyName: string): Promise<any[]> {
        const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyLedgersCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLUSERTDL>
          <COLLECTION NAME="MyLedgersCollection" TYPE="Ledger">
            <FETCH>Name,Parent,ClosingBalance,Email,LedgerPhone,Address</FETCH>
          </COLLECTION>
        </TDLUSERTDL>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
        `.trim();

        const xmlResponse = await this.sendRequest(tallyIp, port, xmlRequest);
        if (typeof window === 'undefined') {
            return parseLedgersXmlRegex(xmlResponse);
        } else {
            return parseLedgersXmlDOM(xmlResponse);
        }
    },

    /**
     * Synchronize Stock Items and Ledgers from Tally Prime into the local Supabase Database
     */
    async syncFromTally(tallyIp: string, port: string, companyName: string): Promise<{ itemsSynced: number, partiesSynced: number, logs: string[], hadErrors: boolean }> {
        const logs: string[] = [];
        let itemsSynced = 0;
        let partiesSynced = 0;
        let hadErrors = false;

        logs.push(`Starting Tally sync at ${new Date().toLocaleTimeString()}...`);

        // 1. Sync Stock Items
        try {
            logs.push(`Fetching stock items from Tally...`);
            const tallyItems = await this.fetchStockItems(tallyIp, port, companyName);
            logs.push(`Fetched ${tallyItems.length} stock items from Tally.`);

            if (tallyItems.length > 0) {
                const currentItems = await db.items.getAll();
                const itemMap = new Map(currentItems.map(item => [item.name.toLowerCase().trim(), item]));

                for (const tItem of tallyItems) {
                    const matchedItem = itemMap.get(tItem.name.toLowerCase().trim());
                    if (matchedItem) {
                        // Update existing item
                        const updated = {
                            ...matchedItem,
                            stock: tItem.stock,
                            rate: tItem.rate || matchedItem.rate,
                            purchaseRate: tItem.purchaseRate || matchedItem.purchaseRate
                        };
                        await db.items.update(updated);
                        itemsSynced++;
                    } else {
                        // Create new item
                        const newItem = {
                            id: crypto.randomUUID(),
                            name: tItem.name,
                            category: 'glass' as const,
                            type: 'Toughened', // Default type
                            unit: tItem.unit,
                            stock: tItem.stock,
                            rate: tItem.rate || 0,
                            purchaseRate: tItem.purchaseRate || 0
                        };
                        await db.items.add(newItem);
                        itemsSynced++;
                    }
                }
                logs.push(`Successfully synced ${itemsSynced} stock items.`);
            }
        } catch (err: any) {
            logs.push(`❌ Stock Item Sync failed: ${err.message}`);
            console.warn('Stock Item Sync failed:', err.message);
            hadErrors = true;
        }

        // 2. Sync Ledgers / Parties
        try {
            logs.push(`Fetching ledgers from Tally...`);
            const tallyLedgers = await this.fetchLedgers(tallyIp, port, companyName);
            logs.push(`Fetched ${tallyLedgers.length} ledgers from Tally.`);

            if (tallyLedgers.length > 0) {
                const currentParties = await db.parties.getAll();
                const partyMap = new Map(currentParties.map(p => [p.name.toLowerCase().trim(), p]));

                for (const tLedger of tallyLedgers) {
                    const matchedParty = partyMap.get(tLedger.name.toLowerCase().trim());
                    if (matchedParty) {
                        // Update existing party
                        const updated = {
                            ...matchedParty,
                            phone: tLedger.phone || matchedParty.phone,
                            address: tLedger.address || matchedParty.address,
                            balance: tLedger.balance
                        };
                        await db.parties.update(updated);
                        partiesSynced++;
                    } else {
                        // Create new party
                        const newParty = {
                            id: crypto.randomUUID(),
                            name: tLedger.name,
                            type: tLedger.type,
                            phone: tLedger.phone || '',
                            address: tLedger.address || '',
                            balance: tLedger.balance || 0
                        };
                        await db.parties.add(newParty);
                        partiesSynced++;
                    }
                }
                logs.push(`Successfully synced ${partiesSynced} ledgers.`);
            }
        } catch (err: any) {
            logs.push(`❌ Ledger Sync failed: ${err.message}`);
            console.warn('Ledger Sync failed:', err.message);
            hadErrors = true;
        }

        logs.push(hadErrors ? 'Tally sync completed with errors.' : 'Tally sync completed!');
        return { itemsSynced, partiesSynced, logs, hadErrors };
    }
};

// Helper to escape special characters for XML
function escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function getXmlNodeText(node: Element, tagName: string): string {
    const el = node.getElementsByTagName(tagName)[0];
    return el ? el.textContent || '' : '';
}

function parseStockItemsXmlDOM(xmlText: string): any[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const stockItems = xmlDoc.getElementsByTagName("STOCKITEM");
    const items: any[] = [];

    for (let i = 0; i < stockItems.length; i++) {
        const node = stockItems[i];
        const name = getXmlNodeText(node, "NAME") || node.getAttribute("NAME") || "";
        if (!name) continue;

        const baseUnits = getXmlNodeText(node, "BASEUNITS");
        const closingBalanceText = getXmlNodeText(node, "CLOSINGBALANCE");
        const cleanBalanceText = closingBalanceText.trim();
        const absoluteQty = Math.abs(parseFloat(cleanBalanceText.replace(/[^0-9.-]/g, '')) || 0);
        
        const standardRate = parseFloat(getXmlNodeText(node, "STANDARDRATE")) || 0;
        const lastPurchaseRate = parseFloat(getXmlNodeText(node, "LASTPURCHASERATE")) || 0;
        
        items.push({
            name,
            unit: baseUnits.toLowerCase() === 'sqft' ? 'sqft' : (baseUnits.toLowerCase() === 'sheets' ? 'sheets' : 'nos'),
            stock: absoluteQty,
            rate: standardRate || 0,
            purchaseRate: lastPurchaseRate || 0,
            description: getXmlNodeText(node, "DESCRIPTION") || ""
        });
    }
    return items;
}

function parseLedgersXmlDOM(xmlText: string): any[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const ledgersNodes = xmlDoc.getElementsByTagName("LEDGER");
    const parties: any[] = [];

    for (let i = 0; i < ledgersNodes.length; i++) {
        const node = ledgersNodes[i];
        const name = getXmlNodeText(node, "NAME") || node.getAttribute("NAME") || "";
        if (!name) continue;

        const parent = getXmlNodeText(node, "PARENT") || "";
        const isCustomer = parent.toLowerCase().includes("debtor");
        const isSupplier = parent.toLowerCase().includes("creditor");
        
        if (!isCustomer && !isSupplier) continue;

        const closingBalance = getXmlNodeText(node, "CLOSINGBALANCE");
        const cleanBalance = closingBalance.trim();
        let balanceNum = parseFloat(cleanBalance.replace(/[^0-9.-]/g, '')) || 0;
        
        if (cleanBalance.toUpperCase().includes("CR")) {
            balanceNum = -Math.abs(balanceNum);
        } else if (cleanBalance.toUpperCase().includes("DR")) {
            balanceNum = Math.abs(balanceNum);
        }

        parties.push({
            name,
            type: isCustomer ? "customer" : "supplier",
            phone: getXmlNodeText(node, "LEDGERPHONE") || "",
            address: getXmlNodeText(node, "ADDRESS") || "",
            balance: balanceNum
        });
    }
    return parties;
}

function parseStockItemsXmlRegex(xmlText: string): any[] {
    const items: any[] = [];
    const itemRegex = /<STOCKITEM[^>]*>([\s\S]*?)<\/STOCKITEM>/g;
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const content = match[1];
        const nameMatch = content.match(/<NAME>([^<]+)<\/NAME>/);
        const name = nameMatch ? nameMatch[1].trim() : '';
        if (!name) continue;

        const unitsMatch = content.match(/<BASEUNITS>([^<]+)<\/BASEUNITS>/);
        const units = unitsMatch ? unitsMatch[1].trim() : 'sqft';

        const balanceMatch = content.match(/<CLOSINGBALANCE>([^<]+)<\/CLOSINGBALANCE>/);
        const balanceVal = balanceMatch ? parseFloat(balanceMatch[1].replace(/[^0-9.-]/g, '')) || 0 : 0;

        const rateMatch = content.match(/<STANDARDRATE>([^<]+)<\/STANDARDRATE>/);
        const rate = rateMatch ? parseFloat(rateMatch[1]) || 0 : 0;

        const pRateMatch = content.match(/<LASTPURCHASERATE>([^<]+)<\/LASTPURCHASERATE>/);
        const pRate = pRateMatch ? parseFloat(pRateMatch[1]) || 0 : 0;

        const descMatch = content.match(/<DESCRIPTION>([^<]+)<\/DESCRIPTION>/);
        const desc = descMatch ? descMatch[1].trim() : '';

        items.push({
            name,
            unit: units.toLowerCase() === 'sqft' ? 'sqft' : (units.toLowerCase() === 'sheets' ? 'sheets' : 'nos'),
            stock: Math.abs(balanceVal),
            rate,
            purchaseRate: pRate || 0,
            description: desc
        });
    }
    return items;
}

function parseLedgersXmlRegex(xmlText: string): any[] {
    const parties: any[] = [];
    const ledgerRegex = /<LEDGER[^>]*>([\s\S]*?)<\/LEDGER>/g;
    let match;
    while ((match = ledgerRegex.exec(xmlText)) !== null) {
        const content = match[1];
        const nameMatch = content.match(/<NAME>([^<]+)<\/NAME>/);
        const name = nameMatch ? nameMatch[1].trim() : '';
        if (!name) continue;

        const parentMatch = content.match(/<PARENT>([^<]+)<\/PARENT>/);
        const parent = parentMatch ? parentMatch[1].trim() : '';
        const isCustomer = parent.toLowerCase().includes("debtor");
        const isSupplier = parent.toLowerCase().includes("creditor");
        if (!isCustomer && !isSupplier) continue;

        const balanceMatch = content.match(/<CLOSINGBALANCE>([^<]+)<\/CLOSINGBALANCE>/);
        let balanceNum = 0;
        if (balanceMatch) {
            const cleanBalance = balanceMatch[1].trim();
            balanceNum = parseFloat(cleanBalance.replace(/[^0-9.-]/g, '')) || 0;
            if (cleanBalance.toUpperCase().includes("CR")) {
                balanceNum = -Math.abs(balanceNum);
            } else if (cleanBalance.toUpperCase().includes("DR")) {
                balanceNum = Math.abs(balanceNum);
            }
        }

        const phoneMatch = content.match(/<LEDGERPHONE>([^<]+)<\/LEDGERPHONE>/);
        const phone = phoneMatch ? phoneMatch[1].trim() : '';

        const addressMatch = content.match(/<ADDRESS>([^<]+)<\/ADDRESS>/);
        const address = addressMatch ? addressMatch[1].trim() : '';

        parties.push({
            name,
            type: isCustomer ? "customer" : "supplier",
            phone,
            address,
            balance: balanceNum
        });
    }
    return parties;
}

import { Transaction } from '../types';

const DEFAULT_SHEET_ID = '1ZJ01yx27FMzBDKdXAF3e1Gy9s6HokAC4FsO6BESzi_w';

// Robust CSV Parser that handles quoted strings and commas inside fields
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentVal.trim());
      if (currentRow.some(cell => cell !== '')) { 
         rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else if (char === '\r') {
      // Ignore carriage returns
    } else {
      currentVal += char;
    }
  }
  
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(cell => cell !== '')) {
       rows.push(currentRow);
    }
  }
  
  return rows;
};

// Helper to ensure we always display Thai Date (DD/MM/YYYY+543)
const formatToThaiDisplayDate = (dateObj: Date): string => {
  if (isNaN(dateObj.getTime())) return '';
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const yearAD = dateObj.getFullYear();
  const yearBE = yearAD + 543; 
  return `${day}/${month}/${yearBE}`;
};

// Helper: Extract Date from a string (e.g. Sheet Name) - The "Smart" Logic
const extractDateFromText = (text: string): Date | null => {
    // Matches DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    // Capture groups: 1=Day, 2=Month, 3=Year
    const match = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (!match) return null;

    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);

    // Handle 2-digit years
    if (year < 100) {
        // Pivot at 40: >40 is 25xx (BE), <=40 is 20xx (AD)
        // e.g. 68 -> 2568, 24 -> 2024
        year = year > 40 ? 2500 + year : 2000 + year;
    }

    // Convert BE to AD
    if (year > 2400) year -= 543;

    const d = new Date(year, month, day);
    // Validate date correctness
    if (isNaN(d.getTime())) return null;
    return d;
};

// Parse flexible Date Strings -> ISO Date
// Supports: DD/MM/YYYY (BE or AD), YYYY-MM-DD, D/M/YY
const parseFlexibleDate = (dateStr: string, timeStr: string = '00:00'): Date => {
  try {
    if (!dateStr) return new Date();
    
    const cleanDate = dateStr.trim();
    let year = new Date().getFullYear();
    let month = 0;
    let day = 1;

    // Case 1: Slash format DD/MM/YYYY or D/M/YYYY or D/M/YY
    if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            let yearPart = parseInt(parts[2], 10);
            
            // Handle 2 digit years
            if (yearPart < 100) {
                if (yearPart > 40) {
                    year = 2500 + yearPart;
                } else {
                    year = 2000 + yearPart;
                }
            } else {
                year = yearPart;
            }
        }
    } 
    // Case 2: Dash format YYYY-MM-DD or DD-MM-YYYY
    else if (cleanDate.includes('-')) {
        // Try standard Date parse first for YYYY-MM-DD
        const d = new Date(cleanDate);
        if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth();
            day = d.getDate();
        } else {
            // Might be DD-MM-YYYY
            const parts = cleanDate.split('-');
            if(parts.length === 3) {
                 day = parseInt(parts[0], 10);
                 month = parseInt(parts[1], 10) - 1;
                 let yearPart = parseInt(parts[2], 10);
                 if (yearPart < 100) {
                     year = yearPart > 40 ? 2500 + yearPart : 2000 + yearPart;
                 } else {
                     year = yearPart;
                 }
            }
        }
    }

    // Logic: If year > 2400, assume Buddhist Era (BE) -> Convert to AD
    if (year > 2400) {
        year -= 543;
    }

    // Handle Time
    const timeParts = timeStr.trim().split(':');
    let hour = 0;
    let minute = 0;
    if (timeParts.length >= 2) {
        hour = parseInt(timeParts[0], 10) || 0;
        minute = parseInt(timeParts[1], 10) || 0;
    }

    return new Date(year, month, day, hour, minute);
  } catch (e) {
    console.warn("Date parse error", e);
    return new Date();
  }
};

const cleanAmount = (amtStr: string): number => {
    if (!amtStr) return 0;
    const clean = amtStr.replace(/[฿, "]/g, '');
    const num = parseFloat(clean.replace(/\s/g, ''));
    return isNaN(num) ? 0 : num;
};

// Updated Extractor to handle Published Links and tricky GIDs
const extractSheetInfo = (urlOrId: string) => {
  const cleanUrl = urlOrId.trim();
  
  // Check for "Published to Web" format (contains /d/e/)
  const isPublished = cleanUrl.includes('/d/e/');

  // Extract GID (Works for both ?gid= and #gid= and &gid=)
  const gidMatch = cleanUrl.match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  if (isPublished) {
    return { sheetId: null, gid, isPublished, cleanUrl };
  }

  // Standard Link extraction
  const idMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]{15,})/);
  const sheetId = idMatch 
    ? idMatch[1] 
    : (!cleanUrl.includes('/') && !cleanUrl.includes(' ') && cleanUrl.length > 20 ? cleanUrl : null);

  return { sheetId, gid, isPublished: false, cleanUrl };
};

export const fetchSheetData = async (
  urlOrId: string = DEFAULT_SHEET_ID, 
  sourceIndex: number = 0,
  sheetName: string = ''
): Promise<Transaction[]> => {
  const { sheetId, gid, isPublished, cleanUrl } = extractSheetInfo(urlOrId);

  let url = '';

  if (isPublished) {
     url = cleanUrl;
     if (url.includes('/pubhtml')) {
        url = url.replace(/\/pubhtml.*/, '/pub?output=csv');
     } else if (url.includes('/pub')) {
        if (!url.includes('output=csv')) {
            url += (url.includes('?') ? '&' : '?') + 'output=csv';
        }
     } else {
         if (!url.includes('output=csv')) {
            url += (url.includes('?') ? '&' : '?') + 'output=csv';
         }
     }
     if (gid && !url.includes(`gid=${gid}`)) {
         url += `&gid=${gid}`;
     }
  } else {
      if (!sheetId) {
        // If it's not a URL and not a valid-looking ID, we return empty rather than trying to fetch
        if (urlOrId.length > 0 && !urlOrId.startsWith('http')) {
             console.warn(`Skipping invalid sheet identifier at index ${sourceIndex}: "${urlOrId}"`);
        }
        return [];
      }
      url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
      if (gid) {
        url += `&gid=${gid}`;
      }
  }

  // --- Implement Retry Logic (3 Attempts) ---
  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;

  while (attempts < MAX_ATTEMPTS) {
    try {
      attempts++;
      const response = await fetch(url);

      if (!response.ok) {
          if (response.status === 429 && attempts < MAX_ATTEMPTS) {
              // Rate limit - wait longer and retry
              await new Promise(res => setTimeout(res, 2000 * attempts));
              continue;
          }
          console.error(`Fetch error (HTTP ${response.status}) index ${sourceIndex}: ${sheetName}. URL: ${url}`);
          return []; 
      }
      
      let csvText = await response.text();
      
      // gviz/tq output might sometimes wrap things if not perfectly clean, 
      // though out:csv should be pure CSV. Let's handle basic cleaning.
      if (csvText.startsWith('/*')) {
           // This is a common wrapper for some Google API responses
           const match = csvText.match(/\((.*)\)/s);
           if (match) csvText = match[1];
      }

      const rows = parseCSV(csvText);

      if (rows.length === 0) return [];

      const headers = rows[0].map(h => h.toLowerCase().trim());
      
      // ... (Rest of processing remains same)
      let amtIdx = headers.findIndex(h => h.match(/amount|จำนวน|ราคา|ยอด|price|cost|expense|จ่าย/i));
      let dateIdx = headers.findIndex(h => h.match(/date|วันที่|ว\.ด\.ป|วัน|time|timestamp|เวลา/i));
      let timeIdx = headers.findIndex(h => h.includes('time') || h.includes('เวลา'));
      let noteIdx = headers.findIndex(h => h.includes('note') || h.includes('บันทึก') || h.includes('รายการ') || h.includes('description'));
      let receiverIdx = headers.findIndex(h => h.includes('receiver') || h.includes('ผู้รับ') || h.includes('category') || h.includes('หมวด'));

      if ((dateIdx === -1 || amtIdx === -1) && rows.length > 1) {
          const firstDataRow = rows[1];
          const datePattern = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{4}[/-]\d{1,2}[/-]\d{1,2})/;
          const numPattern = /^["']?[\d,.]+["']?$/;

          firstDataRow.forEach((cell, idx) => {
              const val = cell.trim();
              if (dateIdx === -1 && datePattern.test(val)) {
                  if (val.includes('/') || val.includes('-')) {
                      dateIdx = idx;
                  }
              }
              if (amtIdx === -1 && numPattern.test(val) && val.length > 0) {
                   amtIdx = idx;
              }
          });
      }

      if (amtIdx === -1) amtIdx = 3; 
      if (dateIdx === -1) dateIdx = 0; 
      if (timeIdx === -1) timeIdx = 5;
      if (noteIdx === -1) noteIdx = 6; 
      if (receiverIdx === -1) receiverIdx = 2; 

      const transactions: Transaction[] = [];
      const startRow = 1;
      const sheetDateOverride = extractDateFromText(sheetName);

      for (let j = startRow; j < rows.length; j++) {
        const row = rows[j];
        if (row.length < 2) continue; 

        const dateStr = row[dateIdx] || '';
        const timeStr = row[timeIdx] || '';
        const noteStr = row[noteIdx] || '';     
        const receiverStr = row[receiverIdx] || ''; 
        const amtStr = row[amtIdx] || '0';

        const amount = cleanAmount(amtStr);
        if (!dateStr && amount === 0) continue;

        let dateObj: Date;
        if (sheetDateOverride) {
            dateObj = new Date(sheetDateOverride);
        } else {
            dateObj = parseFlexibleDate(dateStr, timeStr);
        }

        const displayDate = formatToThaiDisplayDate(dateObj);
        
        let category = 'อื่นๆ (Others)';
        let description = 'ไม่ระบุรายละเอียด';

        if (noteStr && noteStr.trim().length > 0) {
            category = noteStr.trim();
            description = receiverStr ? `${receiverStr} - ${noteStr}` : noteStr;
        } 
        else if (receiverStr) {
            category = receiverStr.trim();
            description = receiverStr;
        }

        transactions.push({
          id: `sheet-${sourceIndex}-row-${j}`,
          date: dateObj.toISOString(),
          displayDate: displayDate,
          category: category, 
          amount: amount,
          description: description,
          sheetSourceIndex: sourceIndex,
          sourceName: sheetName
        });
      }

      return transactions; 

    } catch (error) {
      lastError = error;
      if (attempts < MAX_ATTEMPTS) {
        // Wait before retry
        await new Promise(res => setTimeout(res, 2000 * attempts));
      }
    }
  }

  console.error(`Error fetching sheet index ${sourceIndex}:`, lastError);
  return [];
};
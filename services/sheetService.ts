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

// Parse flexible Date Strings -> ISO Date
// Supports: DD/MM/YYYY (BE or AD), YYYY-MM-DD
const parseFlexibleDate = (dateStr: string, timeStr: string = '00:00'): Date => {
  try {
    if (!dateStr) return new Date();
    
    const cleanDate = dateStr.trim();
    let year = new Date().getFullYear();
    let month = 0;
    let day = 1;

    // Case 1: Slash format DD/MM/YYYY or D/M/YYYY
    if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        }
    } 
    // Case 2: Dash format YYYY-MM-DD
    else if (cleanDate.includes('-')) {
        const d = new Date(cleanDate);
        if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth();
            day = d.getDate();
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

const extractSheetInfo = (urlOrId: string) => {
  const idMatch = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = urlOrId.match(/[#&]gid=([0-9]+)/);
  const sheetId = idMatch ? idMatch[1] : urlOrId; 
  const gid = gidMatch ? gidMatch[1] : null;
  return { sheetId, gid };
};

// Added sourceIndex to generate unique IDs across multiple sheets
// Added sheetName to identify the source
export const fetchSheetData = async (
  urlOrId: string = DEFAULT_SHEET_ID, 
  sourceIndex: number = 0,
  sheetName: string = ''
): Promise<Transaction[]> => {
  const { sheetId, gid } = extractSheetInfo(urlOrId);

  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  if (gid) {
    url += `&gid=${gid}`;
  }

  try {
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'text/csv' }
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);
    
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) return [];

    const headers = rows[0].map(h => h.toLowerCase().trim());
    
    // Column Index Mapping
    let amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('จำนวน'));
    let dateIdx = headers.findIndex(h => h.includes('date') || h.includes('วันที่'));
    let timeIdx = headers.findIndex(h => h.includes('time') || h.includes('เวลา'));
    let noteIdx = headers.findIndex(h => h.includes('note') || h.includes('บันทึก'));
    let receiverIdx = headers.findIndex(h => h.includes('receiver') || h.includes('ผู้รับ'));

    // Fallbacks
    if (amtIdx === -1) amtIdx = 3; 
    if (dateIdx === -1) dateIdx = 4;
    if (timeIdx === -1) timeIdx = 5;
    if (noteIdx === -1) noteIdx = 6; 
    if (receiverIdx === -1) receiverIdx = 2;

    const transactions: Transaction[] = [];
    const startRow = 1;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue; 

      const dateStr = row[dateIdx] || '';
      const timeStr = row[timeIdx] || '';
      const noteStr = row[noteIdx] || '';
      const receiverStr = row[receiverIdx] || '';
      const amtStr = row[amtIdx] || '0';

      const amount = cleanAmount(amtStr);
      
      // Validation
      if (!dateStr && amount === 0) continue;

      const dateObj = parseFlexibleDate(dateStr, timeStr);
      const displayDate = formatToThaiDisplayDate(dateObj);

      // Description & Category Logic
      let description = receiverStr;
      if (noteStr) {
          description = description ? `${receiverStr} - ${noteStr}` : noteStr;
      }
      if (!description) description = "ไม่ระบุรายละเอียด";

      let category = noteStr || 'อื่นๆ (Others)';

      // Generate ID using sourceIndex to avoid collisions between sheets
      transactions.push({
        id: `sheet-${sourceIndex}-row-${i}`,
        date: dateObj.toISOString(),
        displayDate: displayDate, 
        category: category, 
        amount: amount,
        description: description,
        sheetSourceIndex: sourceIndex,
        sourceName: sheetName
      });
    }

    return transactions; // Sorting will happen after merging

  } catch (error) {
    console.error(`Error fetching sheet index ${sourceIndex}:`, error);
    // Return empty array instead of throwing, so other sheets can still load
    return [];
  }
};
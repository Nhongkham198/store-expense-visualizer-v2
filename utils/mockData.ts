import { Transaction } from '../types';

// Helper to convert Thai Date to JS Date for sorting
// Input: "09/01/2569" -> Output: ISO String
const parseThaiDate = (thaiDate: string): string => {
  const parts = thaiDate.split('/');
  if (parts.length !== 3) return new Date().toISOString();
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const buddhistYear = parseInt(parts[2], 10);
  const christianYear = buddhistYear - 543;

  return new Date(christianYear, month, day).toISOString();
};

export const generateMockData = (): Transaction[] => {
  const rawData = [
    { date: "09/01/2569", cat: "วัตถุดิบ (Raw Materials)", amt: 5400, desc: "ซื้อผักและเนื้อสัตว์ตลาดเช้า" },
    { date: "09/01/2569", cat: "ค่าแรง (Wages)", amt: 1200, desc: "ค่าแรงพนักงานพาร์ทไทม์" },
    { date: "09/01/2569", cat: "บรรจุภัณฑ์ (Packaging)", amt: 850, desc: "ถุงพลาสติกและกล่องข้าว" },
    
    { date: "08/01/2569", cat: "วัตถุดิบ (Raw Materials)", amt: 4200, desc: "ซื้อของสดเพิ่ม" },
    { date: "08/01/2569", cat: "สาธารณูปโภค (Utilities)", amt: 3500, desc: "ค่าแก๊สหุงต้ม" },
    
    { date: "07/01/2569", cat: "วัตถุดิบ (Raw Materials)", amt: 6100, desc: "สต็อกของแห้งประจำสัปดาห์" },
    { date: "07/01/2569", cat: "ค่าขนส่ง (Logistics)", amt: 300, desc: "ค่าส่ง GrabExpress" },
    { date: "07/01/2569", cat: "ค่าแรง (Wages)", amt: 1200, desc: "ค่าแรงพนักงานพาร์ทไทม์" },
    
    { date: "06/01/2569", cat: "ซ่อมบำรุง (Maintenance)", amt: 1500, desc: "ซ่อมท่อน้ำซิงค์ล้างจาน" },
    { date: "06/01/2569", cat: "วัตถุดิบ (Raw Materials)", amt: 2200, desc: "ซื้อไข่ไก่และข้าวสาร" },
    
    { date: "05/01/2569", cat: "วัตถุดิบ (Raw Materials)", amt: 4800, desc: "ซื้อผักสด" },
    { date: "05/01/2569", cat: "การตลาด (Marketing)", amt: 1000, desc: "ยิงโฆษณา Facebook" },
    
    { date: "04/01/2569", cat: "ค่าเช่า (Rent)", amt: 15000, desc: "ค่าเช่าที่ประจำเดือน" },
    { date: "04/01/2569", cat: "เบ็ดเตล็ด (Misc)", amt: 500, desc: "อุปกรณ์ทำความสะอาด" },
  ];

  return rawData.map((item, index) => ({
    id: `tx-${index}`,
    displayDate: item.date,
    date: parseThaiDate(item.date),
    category: item.cat,
    amount: item.amt,
    description: item.desc
  }));
};
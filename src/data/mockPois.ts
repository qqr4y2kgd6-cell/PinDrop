import { POI, PrintLayout } from '@/types';

export const mockPois: POI[] = [
  // Tokyo
  { id: '1', name: 'Senso-ji Temple', category: 'Shrine/Temple', cityRegion: 'Tokyo (Asakusa)', lat: 35.7148, lng: 139.7967, active: true, customNumber: 1, notes: 'Historic Buddhist temple.' },
  { id: '2', name: 'Meiji Jingu', category: 'Shrine/Temple', cityRegion: 'Tokyo (Shibuya)', lat: 35.6764, lng: 139.6993, active: true, customNumber: 2 },
  { id: '3', name: 'Yoyogi Park', category: 'Park', cityRegion: 'Tokyo (Shibuya)', lat: 35.6717, lng: 139.6949, active: true, customNumber: 3 },
  { id: '4', name: 'Shinjuku Gyoen National Garden', category: 'Park', cityRegion: 'Tokyo (Shinjuku)', lat: 35.6852, lng: 139.7101, active: true, customNumber: 4 },
  { id: '5', name: 'Tokyo Tower', category: 'Architecture', cityRegion: 'Tokyo (Minato)', lat: 35.6586, lng: 139.7454, active: true, customNumber: 5 },
  { id: '6', name: 'Park Hyatt Tokyo', category: 'Hotel', cityRegion: 'Tokyo (Shinjuku)', lat: 35.6855, lng: 139.6907, active: true, customNumber: 6 },
  
  // Kyoto
  { id: '7', name: 'Fushimi Inari-taisha', category: 'Shrine/Temple', cityRegion: 'Kyoto', lat: 34.9671, lng: 135.7727, active: true, customNumber: 7, notes: 'Thousands of vermilion torii gates.' },
  { id: '8', name: 'Kinkaku-ji (Golden Pavilion)', category: 'Shrine/Temple', cityRegion: 'Kyoto', lat: 35.0394, lng: 135.7292, active: true, customNumber: 8 },
  { id: '9', name: 'Kiyomizu-dera', category: 'Shrine/Temple', cityRegion: 'Kyoto', lat: 34.9949, lng: 135.7850, active: true, customNumber: 9 },
  { id: '10', name: 'Arashiyama Bamboo Grove', category: 'Park', cityRegion: 'Kyoto', lat: 35.0158, lng: 135.6740, active: true, customNumber: 10 },
  { id: '11', name: 'Nishiki Market', category: 'Food', cityRegion: 'Kyoto', lat: 35.0051, lng: 135.7649, active: true, customNumber: 11 },
  { id: '12', name: 'Kyoto Imperial Palace', category: 'Architecture', cityRegion: 'Kyoto', lat: 35.0254, lng: 135.7621, active: true, customNumber: 12 },
  
  // Osaka
  { id: '13', name: 'Osaka Castle', category: 'Architecture', cityRegion: 'Osaka', lat: 34.6873, lng: 135.5262, active: true, customNumber: 13 },
  { id: '14', name: 'Dotonbori', category: 'Food', cityRegion: 'Osaka', lat: 34.6687, lng: 135.5013, active: true, customNumber: 14, notes: 'Street food and neon lights.' },
  { id: '15', name: 'Umeda Sky Building', category: 'Architecture', cityRegion: 'Osaka', lat: 34.7053, lng: 135.4906, active: true, customNumber: 15 },
  { id: '16', name: 'Universal Studios Japan', category: 'Park', cityRegion: 'Osaka', lat: 34.6654, lng: 135.4323, active: true, customNumber: 16 },
  
  // Kanazawa
  { id: '17', name: 'Kenroku-en Garden', category: 'Park', cityRegion: 'Kanazawa', lat: 36.5621, lng: 136.6627, active: true, customNumber: 17, notes: 'One of the top three gardens in Japan.' },
  { id: '18', name: '21st Century Museum of Contemporary Art', category: 'Architecture', cityRegion: 'Kanazawa', lat: 36.5610, lng: 136.6582, active: true, customNumber: 18 },
  { id: '19', name: 'Higashi Chaya District', category: 'Architecture', cityRegion: 'Kanazawa', lat: 36.5724, lng: 136.6665, active: true, customNumber: 19 },
  { id: '20', name: 'Hakuichi (Gold Leaf)', category: 'Food', cityRegion: 'Kanazawa', lat: 36.5719, lng: 136.6644, active: true, customNumber: 20 },
];

export const initialLayout: PrintLayout = {
  pageSize: 'A4',
  orientation: 'landscape',
  spotColor: '#e0563d', // print-friendly accent
  colorMode: 'spot',
  viewports: [
    {
      id: 'vp-1',
      title: 'Japan Overview',
      center: [138.2529, 36.2048],
      zoom: 5,
      positionOnPage: { x: 5, y: 5, width: 150, height: 140 },
      showGrid: true,
      showTitle: true,
      titleBackground: true,
      titleBackgroundColor: '#e0563d',
      roundedCorners: false,
      cornerRadius: 0,
      borderWidth: 0.1,
      borderColor: '#000000',
      backgroundColor: '#ffffff',
    },
    {
      id: 'vp-2',
      title: 'Tokyo Detail',
      center: [139.7967, 35.7148],
      zoom: 12,
      positionOnPage: { x: 160, y: 5, width: 130, height: 85 },
      showGrid: true,
      showTitle: true,
      titleBackground: true,
      titleBackgroundColor: '#e0563d',
      roundedCorners: false,
      cornerRadius: 0,
      borderWidth: 0.1,
      borderColor: '#000000',
      backgroundColor: '#ffffff',
    },
    {
      id: 'vp-3',
      title: 'Kyoto Detail',
      center: [135.7727, 34.9671],
      zoom: 12,
      positionOnPage: { x: 160, y: 95, width: 130, height: 85 },
      showGrid: true,
      showTitle: true,
      titleBackground: true,
      titleBackgroundColor: '#e0563d',
      roundedCorners: false,
      cornerRadius: 0,
      borderWidth: 0.1,
      borderColor: '#000000',
      backgroundColor: '#ffffff',
    }
  ],
  indexLists: [
    {
      id: 'index-1',
      position: { x: 5, y: 160, width: 285, height: 38 },
      scope: 'all',
      sortBy: 'number',
      sortDirection: 'asc',
      groupBy: 'category',
      columns: 2,
    },
  ],
  titleBlocks: [],
  indexColumns: 2,
  pageMargins: { top: 10, right: 10, bottom: 10, left: 10 },
  itemSpacing: 5,
  defaultTitleBackgroundColor: '#ffffff',
  titleFontFamily: 'Helvetica',
  titleFontSize: 3,
  titleFontWeight: 'bold',
  indexListBodyFontFamily: 'Helvetica',
  indexListBodyFontSize: 2.8,
  indexListBodyFontWeight: 'normal',
  indexListBodyTextColor: '#262626',
  indexListCategoryFontWeight: 'bold',
  indexListCategoryColor: '#1a1a1a',
};

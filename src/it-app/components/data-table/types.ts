export interface Device {
  _id: number;
  deviceName: string;
  ipAddress: string;
  status: 'Online' | 'Offline' | 'Warning';
  location: string;
  uptime: string;
}
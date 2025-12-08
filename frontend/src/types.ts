export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface Recipient {
  id: number;
  name: string;
  email?: string;
  notes?: string;
}

export interface MediaItem {
  id: number;
  title: string;
  media_type: 'audio' | 'video';
  filename: string;
  cover_filename?: string;
  created_at: string;
}

export interface Album {
  id: number;
  title: string;
  description?: string;
  cover_filename?: string;
  media_items: MediaItem[];
}

export interface Assignment {
  id: number;
  recipient_id: number;
  album_id: number;
  token: string;
  created_at: string;
}

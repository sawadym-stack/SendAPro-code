import api from './api'

export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  senderName: string
  type: 'text' | 'voice' | 'image'
  content: string
  mediaUrl: string
  createdAt: string
  isRead: boolean
  // Optional status field for optimistic UI
  status?: 'sending' | 'sent' | 'failed'
}

export interface ChatRoom {
  id: string
  jobId: string
  customerId: string
  technicianId: string
  createdAt?: string
  lastMessageAt?: string
  unreadCount?: number
}

export interface SendMessageDto {
  type: 'text' | 'voice' | 'image'
  content?: string
  mediaUrl?: string
}

export interface UploadResult {
  mediaUrl: string
  presignedUrl: string
  type: string
  size: number
}

const chatService = {
  async getRoom(jobId: string): Promise<ChatRoom> {
    const response = await api.get<ChatRoom>(`/chat/rooms/${jobId}`)
    return response.data
  },

  async getHistory(roomIdOrJobId: string, limit: number, beforeId?: string): Promise<ChatMessage[]> {
    const response = await api.get<ChatMessage[]>(`/chat/rooms/${roomIdOrJobId}/messages`, {
      params: { limit, before: beforeId },
    })
    return response.data
  },

  async sendMessage(roomId: string, data: SendMessageDto): Promise<ChatMessage> {
    const response = await api.post<ChatMessage>(`/chat/rooms/${roomId}/messages`, data)
    return response.data
  },

  async uploadFile(roomId: string, file: File): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post<UploadResult>(`/chat/rooms/${roomId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async markRead(roomId: string): Promise<void> {
    await api.post(`/chat/rooms/${roomId}/read`)
  },
}

export default chatService

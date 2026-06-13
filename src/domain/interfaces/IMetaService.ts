export interface MetaSendResult {
  waMessageId: string;
}

export interface IMetaService {
  sendMessage(phoneNumberId: string, to: string, text: string): Promise<MetaSendResult>;
}

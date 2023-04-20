import { Subject } from 'rxjs'

export interface Message {
  /**
   * Step tag
   */
  tag: string
  /**
   * Step type
   */
  type?: 'Context' | 'Outcome' | 'Action' | string
  /**
   * Occurrence life cycle
   */
  action: 'beforeRunStep' | 'afterRunStep' | 'beforeRunHook' | 'afterRunHook'
}

export const messageCenter = new Subject<Message>()

export function sendMessage(message: Message) {
  messageCenter.next(message)
}

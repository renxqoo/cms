import type { UploadSession } from '../../contracts/assets';
import type { AssetBudget } from './document-asset-types';

export interface AssetUploadQueueProps {
  collection: string;
  budget: AssetBudget;
  purpose: 'create';
  disabled?: boolean;
  onReady?: (session: UploadSession) => void;
  onTerminal?: (session: UploadSession) => void;
  onActivityChange?: (active: boolean) => void;
}

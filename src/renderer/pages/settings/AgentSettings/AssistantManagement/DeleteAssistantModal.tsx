/**
 * DeleteAssistantModal — Confirmation modal for deleting an assistant.
 */
import type { AssistantListItem } from './types';
import AssistantAvatar from './AssistantAvatar';
import { Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type DeleteAssistantModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  activeAssistant: AssistantListItem | null;
  avatarImageMap: Record<string, string>;
};

const DeleteAssistantModal: React.FC<DeleteAssistantModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  activeAssistant,
  avatarImageMap,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ status: 'danger' }}
      okText={t('common.delete', { defaultValue: 'Delete' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      className='w-[90vw] md:w-[400px]'
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <div className='settings-modal-surface p-16px'>
        <p>
          {t('settings.deleteAssistantConfirm', {
            defaultValue: 'Are you sure you want to delete this assistant? This action cannot be undone.',
          })}
        </p>
        {activeAssistant?.isBuiltin ? (
          <div className='settings-note-card mt-8px text-13px'>
            {t('settings.deleteBuiltinAssistantExtra', {
              defaultValue:
                'Built-in assistants are removed from your list and will not reappear after restart. You can use Duplicate to keep a copy first.',
            })}
          </div>
        ) : null}
        {activeAssistant && (
          <div className='settings-card-grid-item mt-12px p-12px flex items-center gap-12px'>
            <AssistantAvatar assistant={activeAssistant} size={32} avatarImageMap={avatarImageMap} />
            <div>
              <div className='settings-card-header__title'>{activeAssistant.name}</div>
              <div className='text-12px text-t-secondary'>{activeAssistant.description}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default DeleteAssistantModal;

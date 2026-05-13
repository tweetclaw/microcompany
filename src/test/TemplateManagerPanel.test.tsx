import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TemplateManagerPanel from '../components/TemplateManagerPanel';
import type { ProviderConfig } from '../types/settings';
import type { SystemTemplate, TemplateSummary, UserTemplate } from '../types/template';

const listAllTemplateSummariesMock = vi.fn();
const getSystemTemplateMock = vi.fn();
const listUserTemplatesMock = vi.fn();

type MockEditTemplateModalProps = {
  template: SystemTemplate | UserTemplate;
  availableProviders: ProviderConfig[];
  onClose: () => void;
  onSaved: (savedTemplate?: UserTemplate) => void;
  onDeleted?: (templateId: string) => void;
};

const editTemplateModalMock = vi.fn(
  ({ template }: MockEditTemplateModalProps) => (
    <div data-testid="edit-template-modal">opened:{template.id}</div>
  )
);

vi.mock('../api/templates', () => ({
  listAllTemplateSummaries: (...args: unknown[]) => listAllTemplateSummariesMock(...args),
  getSystemTemplate: (...args: unknown[]) => getSystemTemplateMock(...args),
  listUserTemplates: (...args: unknown[]) => listUserTemplatesMock(...args),
}));

vi.mock('../components/EditTemplateModal', () => ({
  default: (props: MockEditTemplateModalProps) => editTemplateModalMock(props),
}));

const providers: ProviderConfig[] = [
  {
    id: 'provider-a',
    name: 'Provider A',
    apiKey: 'key',
    model: 'model-a',
    enabled: true,
  },
];

const summaries: TemplateSummary[] = [
  {
    id: 'system-1',
    name: 'Dev Team',
    description: 'System template for development',
    icon: '🧠',
    category: 'development',
    source: 'system',
    role_count: 3,
    tags: ['dev', 'backend', 'frontend'],
  },
  {
    id: 'user-1',
    name: 'My Product Team',
    description: 'Custom product workflow',
    icon: '🚀',
    source: 'user',
    role_count: 2,
    tags: ['product'],
    created_at: '2025-01-02T12:00:00Z',
    updated_at: '2025-01-03T08:30:00Z',
  },
];

const systemTemplateDetail: SystemTemplate = {
  id: 'system-1',
  name: 'Dev Team',
  description: 'System template for development',
  icon: '🧠',
  category: 'development',
  pm_first_workflow: false,
  roles: [],
  tags: ['dev', 'backend', 'frontend'],
  source_path: 'builtin/dev.json',
};

const userTemplateDetail: UserTemplate = {
  id: 'user-1',
  name: 'My Product Team',
  description: 'Custom product workflow',
  icon: '🚀',
  pm_first_workflow: false,
  roles: [],
  source_task_id: null,
  created_at: '2025-01-02T12:00:00Z',
  updated_at: '2025-01-03T08:30:00Z',
};

describe('TemplateManagerPanel', () => {
  beforeEach(() => {
    listAllTemplateSummariesMock.mockReset();
    getSystemTemplateMock.mockReset();
    listUserTemplatesMock.mockReset();
    editTemplateModalMock.mockClear();
  });
  it('filters templates by search query and source', async () => {
    listAllTemplateSummariesMock.mockResolvedValue(summaries);

    render(<TemplateManagerPanel availableProviders={providers} onBack={() => {}} />);

    expect(await screen.findByText('Dev Team')).toBeInTheDocument();
    expect(screen.getByText('My Product Team')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/搜索模板名称、描述、标签/i), {
      target: { value: 'product' },
    });

    expect(await screen.findByText(/共匹配 1 个模板/)).toBeInTheDocument();
    expect(screen.queryByText('Dev Team')).not.toBeInTheDocument();
    expect(screen.getByText('My Product Team')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('全部模板'), {
      target: { value: 'system' },
    });

    expect(await screen.findByText('没有符合当前筛选条件的模板')).toBeInTheDocument();
  });

  it('renders enhanced template summary information', async () => {
    listAllTemplateSummariesMock.mockResolvedValue(summaries);

    render(<TemplateManagerPanel availableProviders={providers} onBack={() => {}} />);

    expect(await screen.findByText('development')).toBeInTheDocument();
    expect(screen.getByText('#dev')).toBeInTheDocument();
    expect(screen.getByText('系统')).toBeInTheDocument();
    expect(screen.getByText('自定义')).toBeInTheDocument();
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
  });

  it('opens system template detail when clicking a system template item', async () => {
    listAllTemplateSummariesMock.mockResolvedValue(summaries);
    getSystemTemplateMock.mockResolvedValue(systemTemplateDetail);
    listUserTemplatesMock.mockResolvedValue([]);

    render(<TemplateManagerPanel availableProviders={providers} onBack={() => {}} />);

    fireEvent.click(await screen.findByText('Dev Team'));

    await waitFor(() => {
      expect(getSystemTemplateMock).toHaveBeenCalledWith('system-1');
    });
    expect(await screen.findByTestId('edit-template-modal')).toHaveTextContent('opened:system-1');
  });

  it('keeps duplicated system template open in editor and shows success message after save callback', async () => {
    listAllTemplateSummariesMock
      .mockResolvedValueOnce(summaries)
      .mockResolvedValueOnce([
        ...summaries,
        {
          id: 'user-copy-1',
          name: 'Dev Team (Copy)',
          description: 'Copied from system template',
          icon: '🧠',
          source: 'user',
          role_count: 3,
          tags: ['dev'],
          created_at: '2025-01-04T10:00:00Z',
          updated_at: '2025-01-04T10:00:00Z',
        },
      ]);
    getSystemTemplateMock.mockResolvedValue(systemTemplateDetail);
    listUserTemplatesMock.mockResolvedValue([userTemplateDetail]);

    render(<TemplateManagerPanel availableProviders={providers} onBack={() => {}} />);

    fireEvent.click(await screen.findByText('Dev Team'));

    await waitFor(() => {
      expect(editTemplateModalMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({ id: 'system-1' }),
        })
      );
    });

    const modalProps = editTemplateModalMock.mock.calls[editTemplateModalMock.mock.calls.length - 1]?.[0];
    expect(modalProps).toBeTruthy();

    await act(async () => {
      await modalProps.onSaved({
        ...userTemplateDetail,
        id: 'user-copy-1',
        name: 'Dev Team (Copy)',
        description: 'Copied from system template',
        updated_at: '2025-01-04T10:00:00Z',
      });
    });

    expect(await screen.findByText('已复制为自定义模板，你现在可以继续编辑副本')).toBeInTheDocument();
    await waitFor(() => {
      expect(listAllTemplateSummariesMock).toHaveBeenCalledTimes(2);
    });
    expect(editTemplateModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ id: 'user-copy-1', name: 'Dev Team (Copy)' }),
      })
    );
  });

  it('refreshes list and shows success message after delete callback', async () => {
    listAllTemplateSummariesMock
      .mockResolvedValueOnce(summaries)
      .mockResolvedValueOnce([summaries[0]]);
    listUserTemplatesMock.mockResolvedValue([userTemplateDetail]);

    render(<TemplateManagerPanel availableProviders={providers} onBack={() => {}} />);

    fireEvent.click(await screen.findByText('My Product Team'));

    await waitFor(() => {
      expect(editTemplateModalMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({ id: 'user-1' }),
        })
      );
    });

    const modalProps = editTemplateModalMock.mock.calls[editTemplateModalMock.mock.calls.length - 1]?.[0];
    expect(modalProps).toBeTruthy();

    await act(async () => {
      await modalProps.onDeleted?.('user-1');
    });

    expect(await screen.findByText('模板已删除')).toBeInTheDocument();
    await waitFor(() => {
      expect(listAllTemplateSummariesMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('edit-template-modal')).not.toBeInTheDocument();
  });
});

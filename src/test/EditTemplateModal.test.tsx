import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditTemplateModal from '../components/EditTemplateModal';
import type { UserTemplate, SystemTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';

const listRoleArchetypesMock = vi.fn();

const updateUserTemplateMock = vi.fn();
const duplicateTemplateAsUserTemplateMock = vi.fn();
const deleteUserTemplateMock = vi.fn();

const dndContextPropsStore: { current: Record<string, unknown> | null } = { current: null };
const sortableIdsStore: { current: string[] } = { current: [] };

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    dndContextPropsStore.current = props;
    return <div data-testid="dnd-context">{children}</div>;
  },
  PointerSensor: function PointerSensor() {},
  KeyboardSensor: function KeyboardSensor() {},
  closestCenter: vi.fn(),
  useSensor: vi.fn((sensor: unknown, options?: unknown) => ({ sensor, options })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    SortableContext: ({ children, items }: React.PropsWithChildren<{ items: string[] }>) => {
      sortableIdsStore.current = items;
      return <div data-testid="sortable-context">{children}</div>;
    },
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listRoleArchetypes: vi.fn(() => listRoleArchetypesMock()),
  };
});

vi.mock('../api/templates', () => ({
  updateUserTemplate: (...args: unknown[]) => updateUserTemplateMock(...args),
  duplicateTemplateAsUserTemplate: (...args: unknown[]) => duplicateTemplateAsUserTemplateMock(...args),
  deleteUserTemplate: (...args: unknown[]) => deleteUserTemplateMock(...args),
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

const baseTemplate: UserTemplate = {
  id: 'tpl-user-1',
  name: 'User Template',
  description: 'desc',
  icon: '📄',
  pm_first_workflow: false,
  roles: [
    {
      name: 'PM',
      identity: 'Product manager',
      provider: 'provider-a',
      model: 'model-a',
      handoff_enabled: true,
      archetype_id: null,
      system_prompt_append: null,
      custom_system_prompt: null,
    },
  ],
  source_task_id: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const reorderTemplate: UserTemplate = {
  ...baseTemplate,
  id: 'tpl-user-reorder',
  name: 'Reorder Template',
  roles: [
    {
      name: 'PM',
      identity: 'Product manager',
      provider: 'provider-a',
      model: 'model-a',
      handoff_enabled: true,
      archetype_id: null,
      system_prompt_append: null,
      custom_system_prompt: null,
    },
    {
      name: 'Engineer',
      identity: 'Software engineer',
      provider: 'provider-a',
      model: 'model-a',
      handoff_enabled: true,
      archetype_id: null,
      system_prompt_append: null,
      custom_system_prompt: null,
    },
    {
      name: 'QA',
      identity: 'Quality assurance',
      provider: 'provider-a',
      model: 'model-a',
      handoff_enabled: true,
      archetype_id: null,
      system_prompt_append: null,
      custom_system_prompt: null,
    },
  ],
};

const systemTemplate: SystemTemplate = {
  id: 'tpl-system-1',
  name: 'System Template',
  description: 'system desc',
  icon: '🏛️',
  category: 'development',
  pm_first_workflow: false,
  roles: [
    {
      name: 'Architect',
      identity: 'System architect',
      provider: 'provider-a',
      model: 'model-a',
      handoff_enabled: true,
      archetype_id: null,
      system_prompt_append: null,
      custom_system_prompt: null,
    },
  ],
  tags: ['system'],
  source_path: 'builtin/system.json',
};

describe('EditTemplateModal', () => {
  beforeEach(() => {
    dndContextPropsStore.current = null;
    sortableIdsStore.current = [];
    listRoleArchetypesMock.mockReset();
    listRoleArchetypesMock.mockImplementation(() => Promise.resolve([]));
    updateUserTemplateMock.mockReset();
    duplicateTemplateAsUserTemplateMock.mockReset();
    deleteUserTemplateMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps save disabled when user template has no unsaved changes', async () => {
    render(
      <EditTemplateModal
        template={baseTemplate}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const saveButton = await screen.findByRole('button', { name: /save template/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByText('你有未保存的修改')).not.toBeInTheDocument();
  });

  it('blocks saving when template still references a missing provider', async () => {
    render(
      <EditTemplateModal
        template={{
          ...baseTemplate,
          roles: [
            {
              ...baseTemplate.roles[0],
              provider: 'missing-provider',
              model: 'legacy-model',
            },
          ],
        }}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    expect(await screen.findByText(/当前绑定的 provider 不存在/i)).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('User Template');
    fireEvent.change(nameInput, { target: { value: 'Updated Template' } });

    const saveButton = screen.getByRole('button', { name: /save template/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(await screen.findByText(/Some roles reference missing providers/i)).toBeInTheDocument();
    expect(updateUserTemplateMock).not.toHaveBeenCalled();
  });

  it('allows editing when archetype is missing without blocking save', async () => {
    updateUserTemplateMock.mockResolvedValue({
      ...baseTemplate,
      name: 'Updated Template',
      roles: [
        {
          ...baseTemplate.roles[0],
          archetype_id: 'missing-archetype',
        },
      ],
    });

    const onSaved = vi.fn();

    render(
      <EditTemplateModal
        template={{
          ...baseTemplate,
          roles: [
            {
              ...baseTemplate.roles[0],
              archetype_id: 'missing-archetype',
            },
          ],
        }}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );

    expect(await screen.findByText(/当前绑定的 archetype 不存在/i)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('User Template'), { target: { value: 'Updated Template' } });
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));

    await waitFor(() => {
      expect(updateUserTemplateMock).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves roles in the reordered sequence after moving items with controls', async () => {
    updateUserTemplateMock.mockResolvedValue(reorderTemplate);

    render(
      <EditTemplateModal
        template={reorderTemplate}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const moveDownButtons = await screen.findAllByRole('button', { name: '↓' });
    fireEvent.click(moveDownButtons[0]);

    const saveButton = screen.getByRole('button', { name: /save template/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateUserTemplateMock).toHaveBeenCalledTimes(1);
    });

    const [, payload] = updateUserTemplateMock.mock.calls[0];
    expect(payload.roles.map((role: { name: string }) => role.name)).toEqual([
      'Engineer',
      'PM',
      'QA',
    ]);
  });

  it('saves roles in the reordered sequence after drag-and-drop reorder', async () => {
    updateUserTemplateMock.mockResolvedValue(reorderTemplate);

    render(
      <EditTemplateModal
        template={reorderTemplate}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const [firstRoleId, secondRoleId] = sortableIdsStore.current;
    expect(firstRoleId).toBeTruthy();
    expect(secondRoleId).toBeTruthy();
    const onDragEnd = dndContextPropsStore.current?.onDragEnd as
      | ((event: { active: { id: string }; over: { id: string } }) => void)
      | undefined;
    expect(onDragEnd).toBeTypeOf('function');

    await act(async () => {
      onDragEnd?.({
        active: { id: firstRoleId },
        over: { id: secondRoleId },
      });
    });

    const saveButton = screen.getByRole('button', { name: /save template/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateUserTemplateMock).toHaveBeenCalledTimes(1);
    });

    const [, payload] = updateUserTemplateMock.mock.calls[0];
    expect(payload.roles.map((role: { name: string }) => role.name)).toEqual([
      'Engineer',
      'PM',
      'QA',
    ]);
  });

  it('renders system template as readonly and duplicates via copy action', async () => {
    duplicateTemplateAsUserTemplateMock.mockResolvedValue({
      ...baseTemplate,
      id: 'tpl-user-copy',
      name: 'System Template (Copy)',
    });

    const onSaved = vi.fn();

    render(
      <EditTemplateModal
        template={systemTemplate}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );

    expect(await screen.findByText(/系统模板的成员组成是只读的/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除模板/i })).not.toBeInTheDocument();

    const duplicateButton = screen.getByRole('button', { name: /复制为自定义模板/i });
    fireEvent.click(duplicateButton);

    await waitFor(() => {
      expect(duplicateTemplateAsUserTemplateMock).toHaveBeenCalledWith('tpl-system-1');
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tpl-user-copy',
        name: 'System Template (Copy)',
      })
    );
  });

  it('deletes user template after confirmation', async () => {
    deleteUserTemplateMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();

    render(
      <EditTemplateModal
        template={baseTemplate}
        availableProviders={providers}
        onClose={() => {}}
        onSaved={() => {}}
        onDeleted={onDeleted}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /删除模板/i }));

    await waitFor(() => {
      expect(deleteUserTemplateMock).toHaveBeenCalledWith('tpl-user-1');
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledWith('tpl-user-1');
  });

  it('prompts before closing when there are unsaved changes and cancels close if user declines', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();

    render(
      <EditTemplateModal
        template={baseTemplate}
        availableProviders={providers}
        onClose={onClose}
        onSaved={() => {}}
      />
    );

    fireEvent.change(await screen.findByDisplayValue('User Template'), {
      target: { value: 'User Template Updated' },
    });

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

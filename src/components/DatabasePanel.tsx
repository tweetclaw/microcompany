import React, { useState } from 'react';
import { useTasks, useStatistics } from '../hooks/useApi';
import { createBackup, vacuumDatabase } from '../api';
import './DatabasePanel.css';

export default function DatabasePanel() {
  const { tasks } = useTasks();
  const { stats, reload: reloadStats } = useStatistics();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);

  const handleBackup = async () => {
    try {
      setIsBackingUp(true);
      const backup = await createBackup();
      alert(`备份成功！\n路径: ${backup.backup_path}\n大小: ${(backup.backup_size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.error('Backup failed:', error);
      alert('备份失败: ' + error);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleVacuum = async () => {
    try {
      setIsVacuuming(true);
      const result = await vacuumDatabase();
      const savedMB = (result.space_reclaimed / 1024 / 1024).toFixed(2);
      alert(`数据库优化完成！\n回收空间: ${savedMB} MB`);
      reloadStats();
    } catch (error) {
      console.error('Vacuum failed:', error);
      alert('优化失败: ' + error);
    } finally {
      setIsVacuuming(false);
    }
  };

  return (
    <div className="database-panel">
      <h2>数据库管理</h2>

      {stats && (
        <div className="stats-section">
          <h3>统计信息</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">任务总数</span>
              <span className="stat-value">{stats.total_tasks}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">会话总数</span>
              <span className="stat-value">{stats.total_sessions}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">消息总数</span>
              <span className="stat-value">{stats.total_messages}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">普通会话</span>
              <span className="stat-value">{stats.normal_sessions}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">任务会话</span>
              <span className="stat-value">{stats.task_sessions}</span>
            </div>
          </div>
        </div>
      )}

      <div className="actions-section">
        <h3>维护操作</h3>
        <button
          onClick={handleBackup}
          disabled={isBackingUp}
          className="action-button"
        >
          {isBackingUp ? '备份中...' : '创建备份'}
        </button>
        <button
          onClick={handleVacuum}
          disabled={isVacuuming}
          className="action-button"
        >
          {isVacuuming ? '优化中...' : '优化数据库'}
        </button>
      </div>
    </div>
  );
}

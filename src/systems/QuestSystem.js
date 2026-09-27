import { globalBus } from '../engine/EventBus.js';

/**
 * QuestSystem - Manages peaceful exploration objectives and the "Morning Errand" introductory storyline
 */
export class QuestSystem {
  constructor() {
    this.quests = [
      {
        id: 'errand_drink',
        title: 'Morning Errand',
        description: 'Walk down to HIKARI MART on Shopping Street and pick up a morning drink or snack.',
        completed: false,
        progress: 0,
      },
      {
        id: 'meet_tanaka',
        title: 'Visit Sakuragaoka Park',
        description: 'Head to the neighborhood park and greet Mrs. Tanaka by the blooming cherry blossom garden.',
        completed: false,
        progress: 0,
      },
      {
        id: 'pet_cat',
        title: 'Gentle Companion',
        description: 'Pet Mochi the friendly calico cat resting along the park path.',
        completed: false,
        progress: 0,
      },
    ];

    this.currentQuestIndex = 0;
  }

  init() {
    globalBus.on('quest:update', (data) => this.handleQuestProgress(data));
    this.broadcastCurrentQuest();
  }

  getCurrentQuest() {
    return this.quests[this.currentQuestIndex] || null;
  }

  handleQuestProgress(data) {
    const quest = this.quests.find((q) => q.id === data.questId);
    if (!quest || quest.completed) return;

    quest.progress = Math.min(1.0, data.progress);
    if (quest.progress >= 1.0) {
      quest.completed = true;
      globalBus.emit('toast:show', {
        message: `✨ Completed: ${quest.title}!`,
      });

      this.advanceToNextQuest();
    }

    this.broadcastCurrentQuest();
  }

  advanceToNextQuest() {
    const nextUncompleted = this.quests.findIndex((q) => !q.completed);
    if (nextUncompleted !== -1) {
      this.currentQuestIndex = nextUncompleted;
    }
  }

  broadcastCurrentQuest() {
    const current = this.getCurrentQuest();
    const completedCount = this.quests.filter((q) => q.completed).length;
    const totalCount = this.quests.length;

    globalBus.emit('quest:stateChanged', {
      currentQuest: current,
      allCompleted: completedCount === totalCount,
      completedCount,
      totalCount,
    });
  }

  getStateForSave() {
    return {
      currentQuestIndex: this.currentQuestIndex,
      quests: this.quests.map((q) => ({
        id: q.id,
        completed: q.completed,
        progress: q.progress,
      })),
    };
  }

  restoreState(data) {
    if (!data) return;
    if (Array.isArray(data.quests)) {
      for (const sq of data.quests) {
        const quest = this.quests.find((q) => q.id === sq.id);
        if (quest) {
          quest.completed = !!sq.completed;
          quest.progress = typeof sq.progress === 'number' ? sq.progress : (quest.completed ? 1.0 : 0);
        }
      }
    }
    if (typeof data.currentQuestIndex === 'number' && data.currentQuestIndex >= 0 && data.currentQuestIndex < this.quests.length) {
      this.currentQuestIndex = data.currentQuestIndex;
    } else {
      this.advanceToNextQuest();
    }
    this.broadcastCurrentQuest();
  }

  resetQuests() {
    for (const q of this.quests) {
      q.completed = false;
      q.progress = 0;
    }
    this.currentQuestIndex = 0;
    this.broadcastCurrentQuest();
  }

  update() {}
}

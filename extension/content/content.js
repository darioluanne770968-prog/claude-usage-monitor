// Content Script - 读取 Claude usage 页面数据

console.log('Claude 用量监控：Content Script 已加载');

// 等待页面完全加载
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Element not found within timeout'));
    }, timeout);
  });
}

// 解析百分比文本
function parsePercentage(text) {
  const match = text.match(/(\d+)%/);
  return match ? parseInt(match[1]) : 0;
}

// 解析重置时间文本（例如 "Resets in 1 hr 30 min"）
function parseResetTime(text) {
  if (!text || text.includes('just now')) {
    return 0;
  }

  let totalMinutes = 0;

  // 匹配小时
  const hourMatch = text.match(/(\d+)\s*hr/);
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1]) * 60;
  }

  // 匹配分钟
  const minMatch = text.match(/(\d+)\s*min/);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1]);
  }

  return totalMinutes;
}

// 计算绝对重置时间戳（根据分钟数）
function calculateResetTimestamp(minutesFromNow) {
  const now = Date.now();
  return now + (minutesFromNow * 60 * 1000);
}

// 解析固定时间（如 "Resets Tue 12:59 PM"）转为下一个该时间的时间戳
function parseFixedResetTime(timeStr) {
  if (!timeStr) return null;

  try {
    // 匹配类似 "Tue 12:59 PM" 或 "Resets Tue 12:59 PM" 的格式
    const match = timeStr.match(/(\w+)\s+(\d+):(\d+)\s+(AM|PM)/i);
    if (!match) return null;

    const [, dayName, hour, minute, ampm] = match;

    // 转换星期名称
    const daysMap = {
      'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3,
      'thu': 4, 'fri': 5, 'sat': 6
    };
    const targetDay = daysMap[dayName.toLowerCase().substring(0, 3)];
    if (targetDay === undefined) return null;

    // 转换为24小时制
    let hour24 = parseInt(hour);
    if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    }

    // 计算下一个目标时间
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setHours(hour24, parseInt(minute), 0, 0);

    // 如果今天是目标星期几
    const currentDay = now.getDay();
    let daysUntilTarget = targetDay - currentDay;

    // 如果已经过了这个时间，则计算到下周
    if (daysUntilTarget < 0 || (daysUntilTarget === 0 && now > targetDate)) {
      daysUntilTarget += 7;
    }

    targetDate.setDate(targetDate.getDate() + daysUntilTarget);
    return targetDate.getTime();
  } catch (error) {
    console.error('解析固定重置时间失败:', error);
    return null;
  }
}

// 尝试从页面获取账号邮箱
function detectAccountEmail() {
  try {
    // 方法1: 从页面文本中查找邮箱
    const allText = document.body.innerText;
    const emailMatch = allText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      console.log('检测到账号邮箱:', emailMatch[1]);
      return emailMatch[1];
    }

    // 方法2: 查找特定元素（可能包含邮箱）
    const emailElements = document.querySelectorAll('[type="email"], [data-testid*="email"]');
    for (const el of emailElements) {
      const email = el.value || el.textContent;
      if (email && email.includes('@')) {
        console.log('从元素检测到账号邮箱:', email);
        return email.trim();
      }
    }

    console.log('未检测到账号邮箱，使用默认标识');
    return 'account_default';
  } catch (error) {
    console.error('检测账号邮箱失败:', error);
    return 'account_default';
  }
}

// 读取用量数据
async function readUsageData() {
  try {
    console.log('开始读取用量数据...');

    // 等待页面基本内容加载（等待包含 "Plan usage limits" 的文本）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检测当前账号
    const accountId = detectAccountEmail();
    console.log('当前账号:', accountId);

    const now = Date.now();
    const usageData = {
      accountId: accountId,  // 添加账号标识
      timestamp: now,
      lastSync: now,  // 添加上次同步时间
      currentSession: {
        percentage: 0,
        resetMinutes: 0,
        resetTimestamp: null,  // 绝对重置时间戳
        label: 'Current session'
      },
      weeklyLimits: {
        percentage: 0,
        resetMinutes: 0,
        resetTimestamp: null,  // 绝对重置时间戳
        label: 'Weekly limits'
      },
      fiveHourLimit: {
        percentage: 0,
        resetMinutes: 0,
        resetTimestamp: null,  // 绝对重置时间戳
        label: '5-hour rolling window'
      }
    };

    // 查找所有包含百分比和使用量信息的元素
    const allText = document.body.innerText;
    console.log('页面文本片段:', allText.substring(0, 500));

    // 方法1: 尝试匹配带百分比的 Current session
    let currentSessionMatch = allText.match(/Current session[\s\S]*?(\d+)%/i);
    if (currentSessionMatch) {
      usageData.currentSession.percentage = parseInt(currentSessionMatch[1]);
      console.log('找到 Current session 百分比:', currentSessionMatch[1]);
    }

    // 提取 Current session 的重置时间
    let currentResetMatch = allText.match(/Current session[\s\S]*?Resets in\s+([^\n]+)/i);
    if (currentResetMatch) {
      const minutes = parseResetTime(currentResetMatch[1]);
      usageData.currentSession.resetMinutes = minutes;
      usageData.currentSession.resetTimestamp = calculateResetTimestamp(minutes);
      console.log('Current session 重置时间:', currentResetMatch[1], '→', minutes, '分钟');
    }

    // 方法2: 尝试匹配 Weekly limits (All models)
    let weeklyMatch = allText.match(/All models[\s\S]*?(\d+)%/i);
    if (weeklyMatch) {
      usageData.weeklyLimits.percentage = parseInt(weeklyMatch[1]);
      console.log('找到 Weekly limits 百分比:', weeklyMatch[1]);
    }

    // 提取 Weekly limits 的重置时间（可能是倒计时或固定时间）
    let weeklyResetMatch = allText.match(/All models[\s\S]*?Resets\s+([^\n]+)/i);
    if (weeklyResetMatch) {
      const resetText = weeklyResetMatch[1];
      // 检查是否是固定时间格式（如 "Tue 12:59 PM"）
      if (resetText.match(/\w+\s+\d+:\d+\s+(AM|PM)/i)) {
        const timestamp = parseFixedResetTime(resetText);
        if (timestamp) {
          usageData.weeklyLimits.resetTimestamp = timestamp;
          // 计算距离现在还有多少分钟
          usageData.weeklyLimits.resetMinutes = Math.floor((timestamp - now) / 60000);
          console.log('Weekly limits 固定重置时间:', resetText, '→', new Date(timestamp).toLocaleString());
        }
      } else {
        // 倒计时格式（如 "in 2 hr 30 min"）
        const minutes = parseResetTime(resetText);
        usageData.weeklyLimits.resetMinutes = minutes;
        usageData.weeklyLimits.resetTimestamp = calculateResetTimestamp(minutes);
        console.log('Weekly limits 重置倒计时:', resetText, '→', minutes, '分钟');
      }
    }

    // 方法3: 尝试查找5小时限制
    const fiveHourMatch = allText.match(/5[\s-]hour[\s\S]*?(\d+)%/i);
    if (fiveHourMatch) {
      usageData.fiveHourLimit.percentage = parseInt(fiveHourMatch[1]);
      const fiveHourResetMatch = allText.match(/5[\s-]hour[\s\S]*?Resets in\s+([^\n]+)/i);
      if (fiveHourResetMatch) {
        const minutes = parseResetTime(fiveHourResetMatch[1]);
        usageData.fiveHourLimit.resetMinutes = minutes;
        usageData.fiveHourLimit.resetTimestamp = calculateResetTimestamp(minutes);
        console.log('5-hour limit 重置时间:', fiveHourResetMatch[1], '→', minutes, '分钟');
      }
      console.log('找到 5-hour limit:', fiveHourMatch[1]);
    } else {
      // 如果没有单独的5小时限制显示，使用 Current session 作为替代
      usageData.fiveHourLimit = {
        percentage: usageData.currentSession.percentage,
        resetMinutes: usageData.currentSession.resetMinutes || 300,
        resetTimestamp: usageData.currentSession.resetTimestamp || calculateResetTimestamp(300),
        label: '5-hour rolling window'
      };
      console.log('未找到5小时限制，使用 Current session 数据');
    }

    console.log('读取到的用量数据:', usageData);

    // 发送数据到 background script
    chrome.runtime.sendMessage({
      type: 'USAGE_DATA_UPDATE',
      data: usageData
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
      } else {
        console.log('数据已发送到 background script');
      }
    });

    return usageData;

  } catch (error) {
    console.error('读取用量数据失败:', error);
    return null;
  }
}

// 页面加载完成后读取数据
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(readUsageData, 2000);
  });
} else {
  setTimeout(readUsageData, 2000);
}

// 监听页面变化，实时更新数据
const observer = new MutationObserver(() => {
  // 防抖：避免频繁触发
  clearTimeout(observer.timer);
  observer.timer = setTimeout(readUsageData, 3000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 监听来自 popup 的请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'READ_USAGE_NOW') {
    readUsageData().then(data => {
      sendResponse({ success: true, data });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开启
  }
});

console.log('Content Script 初始化完成');

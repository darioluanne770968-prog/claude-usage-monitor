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

// 读取用量数据
async function readUsageData() {
  try {
    console.log('开始读取用量数据...');

    // 等待页面基本内容加载（等待包含 "Plan usage limits" 的文本）
    await new Promise(resolve => setTimeout(resolve, 2000));

    const usageData = {
      timestamp: Date.now(),
      currentSession: {
        percentage: 0,
        resetMinutes: 0,
        label: 'Current session'
      },
      weeklyLimits: {
        percentage: 0,
        resetMinutes: 0,
        label: 'Weekly limits'
      },
      fiveHourLimit: {
        percentage: 0,
        resetMinutes: 0,
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
      usageData.currentSession.resetMinutes = parseResetTime(currentResetMatch[1]);
      console.log('Current session 重置时间:', currentResetMatch[1]);
    }

    // 方法2: 尝试匹配 Weekly limits (All models)
    let weeklyMatch = allText.match(/All models[\s\S]*?(\d+)%/i);
    if (weeklyMatch) {
      usageData.weeklyLimits.percentage = parseInt(weeklyMatch[1]);
      console.log('找到 Weekly limits 百分比:', weeklyMatch[1]);
    }

    // 提取 Weekly limits 的重置时间
    let weeklyResetMatch = allText.match(/All models[\s\S]*?Resets in\s+([^\n]+)/i);
    if (weeklyResetMatch) {
      usageData.weeklyLimits.resetMinutes = parseResetTime(weeklyResetMatch[1]);
      console.log('Weekly limits 重置时间:', weeklyResetMatch[1]);
    }

    // 方法3: 尝试查找5小时限制
    const fiveHourMatch = allText.match(/5[\s-]hour[\s\S]*?(\d+)%/i);
    if (fiveHourMatch) {
      usageData.fiveHourLimit.percentage = parseInt(fiveHourMatch[1]);
      const fiveHourResetMatch = allText.match(/5[\s-]hour[\s\S]*?Resets in\s+([^\n]+)/i);
      if (fiveHourResetMatch) {
        usageData.fiveHourLimit.resetMinutes = parseResetTime(fiveHourResetMatch[1]);
      }
      console.log('找到 5-hour limit:', fiveHourMatch[1]);
    } else {
      // 如果没有单独的5小时限制显示，使用 Current session 作为替代
      usageData.fiveHourLimit = {
        percentage: usageData.currentSession.percentage,
        resetMinutes: usageData.currentSession.resetMinutes || 300,
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

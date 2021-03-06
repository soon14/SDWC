import Vue from 'vue';

import i18n from '@/i18n';
import store from '@/store';
import { MutationTypes as NOTI } from '@/store/modules/notification';
import MqttClient from '@/api/mqtt';

/**
 * @this {Vue}
 * @param {number} id
 * @param {SDWC.ControlItem} ctl
 * @param {SDWC.MqttControlOptions} options
 */
export async function mqtt(id, { mission, arg = [] }, options = {}) {
  return MqttClient.invoke(id, mission, arg, options);
}

/**
 * ellipsis too long JSON values
 * @param {string} key
 * @param {any} value
 */
function replacer(key, value) {
  if (typeof value === 'string' && value.length > 10) {
    return '...';
  }
  return value;
}

function stringifyMission({ method, params }) {
  if (!params) {
    return method;
  }
  const a = JSON.stringify(params, replacer);
  if (a === '[]' || a === '{}') {
    return method;
  }
  return `${method} ${a}`;
}

/**
 * @param {SDWC.NotificationItem} n
 * @param {boolean} mod
 */
function emitNotification(n, mod = false) {
  if (store.state.notification.findIndex(item => item.id === n.id) > -1) {
    mod = true;
  }
  store.commit(mod ? NOTI.MOD_NOTI : NOTI.ADD_NOTI, n);
}

function registerRpcListener() {
  MqttClient.on('rpc:request', ({ id, request }) => {
    let prefix = request.payload.id.split('-')[0];
    const node = store.state.node.find(node => node.info.id === id).info;
    if (!node) return;
    emitNotification({
      id: request.payload.id,
      time: Date.now(),
      prefix,
      status: 1,
      title: `${node.name} : ${stringifyMission(request.payload)}`
    });
  });
  let notificationId = 0;
  MqttClient.on('rpc:notification', ({ id, request }) => {
    const node = store.state.node.find(node => node.info.id === id).info;
    if (!node) return;
    const now = Date.now();
    emitNotification({
      id: `nodes/${id}/notif/${notificationId++}`,
      time: now,
      prefix: 'Notification',
      status: 3,
      title: `${node.name} : ${stringifyMission(request.payload)}`
    });
  });
  MqttClient.on('rpc:response', ({ response }) => {
    const status = response.type === 'success' ? 0 : 2;
    emitNotification({ id: response.payload.id, status }, true);
  });
}

function registerStatusListener() {
  MqttClient.on('status', ({ id, code }) => {
    const node = store.state.node.find(node => node.info.id === id);
    if (!node || node.status === code) return;
    const now = Date.now();
    const st = i18n.t(`header.status_${code}`);
    emitNotification({
      id: `nodes/${id}/status/${now}`,
      time: now,
      prefix: 'Status',
      status: code,
      title: `${node.info.name} : ${st}`
    });
  });
}

Vue.use({
  install(Vue) {
    Vue.prototype.$mqtt = mqtt;
    registerRpcListener();
    registerStatusListener();
  }
});

// Words for the LAN service's reason codes (the backend only sends codes).

import type { LanRole } from "../../lib/ipc";
import { isWindows } from "../../lib/platform";

export function errCode(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function reasonText(code: string | null | undefined, role: LanRole): string {
  const send = role === "send";
  switch (code) {
    case "declined":
      return send ? "对方拒绝了接收" : "已拒绝接收";
    case "timeout":
      return send ? "对方没有回应" : "没有及时接收，请求已过期";
    case "too_large":
      return "文件超过 1 GB，不能通过局域网发送";
    case "unsupported":
      return "这种文件不能通过局域网发送";
    case "busy":
      return "对方还有其他请求在等待确认，请稍后再试";
    case "disabled":
      return send ? "对方关闭了局域网同步" : "局域网同步已关闭";
    case "version":
      return "对方的 LightPlayer 版本不同，请把两台设备都更新到最新版本";
    case "canceled":
      return "传输已取消";
    case "disk_full":
      return send ? "对方的磁盘空间不足" : "磁盘空间不足，没有保存";
    case "write_failed":
      return send ? "对方无法保存文件" : "无法保存文件";
    case "incomplete":
      return "文件没有完整传输";
    case "stalled":
      return "传输中断了";
    case "switched":
      return send ? "已切换到其他媒体，同步结束" : "对方切换到了其他媒体，同步结束";
    case "stopped":
      return send ? "已停止同步" : "对方停止了同步";
    case "left":
      return send ? "对方停止了跟随" : "已停止跟随";
    case "exit":
      return "对方退出了 LightPlayer";
    case "lost":
      return "连接中断";
    case "replaced":
      return send ? "对方开始接收另一个文件，同步结束" : "已开始接收另一个文件";
    case "done":
      return send ? "已发送，对方没有选择跟随播放" : "已接收";
    case "forbidden":
      return "对方拒绝了连接";
    case "not_found":
      return "找不到这个文件";
    case "unreachable":
      return "无法连接到这台设备";
    case "not_lightplayer":
      return "这个地址上没有可用的 LightPlayer";
    case "local_network_denied":
      return "LightPlayer 没有访问本地网络的权限，请在“系统设置 > 隐私与安全性 > 本地网络”中打开";
    case "no_folder":
      return send ? "对方没有可以保存文件的文件夹" : "找不到保存文件的文件夹";
    case "opened":
      return "已打开其他文件，同步结束";
    case "udp_unavailable":
      return "其他设备暂时找不到本机（端口 47390 被占用），仍可以输入 IP 地址连接";
    case "listen_failed":
      return isWindows ? "局域网同步服务无法启动，请检查防火墙设置" : "局域网同步服务无法启动";
    default:
      return "传输失败";
  }
}

/** Ended this way, the share went as planned (not shown as an error). */
export const okEnd = (code: string | null | undefined) =>
  code === "done" || code === "stopped" || code === "switched" || code === "left" || code === "opened" || code === "canceled";

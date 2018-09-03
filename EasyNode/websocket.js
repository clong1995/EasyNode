/**
 * 定义标准输入
 * ['处理器文件/执行函数',{}//数据]
 */
const ejs = require('EasyNode/base');
const webSocket = require("ws");

let ws = null;
let wsc = null;

//作为服务端发送消息给指定客户端
function send(bindID, jsonStr) {
    ejs.getGlobal('bindMap').get(bindID).send(JSON.stringify(jsonStr));
}

//作为客户端发送消息
function cSend(jsonStr) {
    if (ejs.getGlobal('isOpen') && !ejs.getGlobal('isClose')) {
        ejs.getGlobal('wsc').send(JSON.stringify(jsonStr));
    } else {
        let siv = setInterval(() => {
            if (ejs.getGlobal('isClose'))
                clearInterval(siv);
            else if (ejs.getGlobal('isOpen')) {
                clearInterval(siv);
                ejs.getGlobal('wsc').send(JSON.stringify(jsonStr));
            }
        }, 1000)
    }
}

//作为服务端主动关闭客户端
function remove(cs) {
    cs.terminate();
}

//作为服务端关闭服务端
function close() {
    ejs.getGlobal('ws').close();
}

//作为客户端关闭客户端
function csClose() {
    ejs.replaceGlobal('isClose', true);
    ejs.getGlobal('wsc').close();
}

module.exports = {
    //建立服务端
    server: ({
                 port = 8001,
                 autoclean = 60 * 1000,
                 wsPath = 'server/ws/',//作为服务端的处理路径
             } = {}) => {
        //服务端
        ws = new webSocket.Server({
            port: port
        });
        //链接
        ws.on('connection', cs => {
            cs.on('message', data => {
                data = JSON.parse(data);
                //绑定的客户端
                ejs.setGlobal('bindMap', new Map());
                let r = data[0].split('/');
                //特殊定绑定机制，没有绑定的客户端会被自动清理
                if (r[0] === 'bind') {
                    cs.bindID = r[1];
                    ejs.getGlobal('bindMap').set(r[1], cs);
                    return;
                }
                try {
                    require(ejs.getGlobal('root') + wsPath + '/' + r[0])(r[1], JSON.parse(data[1]));
                } catch (e) {
                    ejs.log(e, 'error');
                }
            })
            cs.on('close', () => ejs.log('client closed'));
        });
        //保存服务端句柄
        ejs.setGlobal('ws', ws);
        //自动清理没有绑定的客户端
        ejs.hasGlobal('bindMap') && autoclean && setInterval(() => ws.clients.forEach(cs => ejs.getGlobal('bindMap').has(cs.bindID) || close(cs)), autoclean)
    },
    //建立客户端
    client: ({
                 port = 8001,//连接端口
                 url = '127.0.0.1',//连接地址
                 openData = null,//打开连接的时候发送的数据
                 autoConnInterval = 5000,//自动重连时间间隔，毫秒
                 autoConnTimes = 10,//自动重连次数
                 wscPath = 'server/wsc/',//作为客户端的处理路径
                 wscMsgInterceptor = null//作为客户端的消息拦截处理器
             } = {}) => {
        //作为客户端的连接句柄
        wsc = new webSocket('ws://' + url + ':' + port);
        let times = 0;

        (function init(cswsHandle) {
            ejs.replaceGlobal('wsc', cswsHandle);
            //打开连接
            ejs.replaceGlobal('isOpen', false);
            ejs.replaceGlobal('isClose', false);

            cswsHandle.onopen = () => {
                ejs.log("connection Successful");
                ejs.replaceGlobal('isOpen', true);
                times = autoConnTimes;
                openData && cSend(openData);
            };

            //断开连接
            cswsHandle.onclose = () => {
                ejs.replaceGlobal('isClose', true);
                ejs.log("connection close");
            }

            //连接错误
            cswsHandle.onerror = () => {
                ejs.log("connection error");
                if (autoConnInterval) {
                    setTimeout(() => {
                        ++times;
                        ejs.log('try reconnect ' + times);
                        if (autoConnTimes > times) {
                            ws = new webSocket('ws://' + url + ':' + port);
                            init(ws);
                        } else {
                            ejs.log("reconnection failure", 'error');
                        }
                    }, autoConnInterval)
                }
            };
            //接受消息
            cswsHandle.onmessage = e => {
                let data = JSON.parse(e.data);

                //TODO 收到的消息
                console.log('接收的消息',data);

                //消息前置处理函数
                if (wscMsgInterceptor && typeof wscMsgInterceptor === 'function')
                    data = wscMsgInterceptor(e.data);
                let r = data[0].split('/');
                try {
                    require(ejs.getGlobal('root') + wscPath + r[0])(r[1], data[1]);
                } catch (e) {
                    ejs.log({
                        'error': '以后完善错误解决方案'
                    }, 'error');
                }
            }
        })(wsc);
    },
    //广播
    broadcast: jsonStr => ejs.getGlobal('bindMap').forEach((key, value) => value => send(value, jsonStr)),
    //向指定的客户端发送消息
    send: send,
    //作为客户端发送消息
    cSend: cSend,
    //删除绑定的客户端
    removeBind: id => {
        remove(ejs.getGlobal('bindMap').get(id));
        ejs.getGlobal('bindMap').delete(id);
    },
    remove: remove,
    close: close,
    csClose: csClose
}

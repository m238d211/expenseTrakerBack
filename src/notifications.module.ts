import { Body, Controller, Delete, Injectable, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DatabaseService } from './database.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
export class DeviceDto { @IsString() token!:string; @IsIn(['ios','android']) platform!:string; }
@Injectable()
export class NotificationsService {
 constructor(private readonly db:DatabaseService,private readonly config:ConfigService){}
 register(userId:string,d:DeviceDto){return this.db.notificationDevice.upsert({where:{token:d.token},create:{...d,userId},update:{userId,platform:d.platform}});}
 remove(userId:string,token:string){return this.db.notificationDevice.deleteMany({where:{userId,token}});}
 async send(userId:string,title:string,body:string){try{const devices=await this.db.notificationDevice.findMany({where:{userId}});if(!devices.length||!this.config.get('FIREBASE_PROJECT_ID'))return {sent:0};if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:this.config.getOrThrow('FIREBASE_PROJECT_ID')});const result=await getMessaging().sendEachForMulticast({tokens:devices.map(d=>d.token),notification:{title,body}});const invalid=devices.filter((_,i)=>!result.responses[i].success).map(d=>d.token);if(invalid.length)await this.db.notificationDevice.deleteMany({where:{token:{in:invalid}}});return {sent:result.successCount,failed:result.failureCount};}catch{return {sent:0};}}
}
@Controller('notifications') @UseGuards(AuthGuard)
export class NotificationsController {constructor(private readonly n:NotificationsService){} @Post('devices') register(@CurrentUser()u:AuthUser,@Body()d:DeviceDto){return this.n.register(u.id,d);} @Delete('devices') remove(@CurrentUser()u:AuthUser,@Body()d:DeviceDto){return this.n.remove(u.id,d.token);}}

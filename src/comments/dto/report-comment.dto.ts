import { IsString, MinLength, MaxLength } from 'class-validator';

export class ReportCommentDto {
  @IsString()
  @MinLength(5,   { message: 'La raison doit faire au moins 5 caractères' })
  @MaxLength(500, { message: 'La raison ne dépasse pas 500 caractères' })
  reason: string;
}

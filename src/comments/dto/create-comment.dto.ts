import { IsString, IsUUID, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCommentDto {
  @IsUUID('4', { message: 'publicationId doit être un UUID v4 valide' })
  publicationId: string;

  @IsString()
  @MinLength(1,    { message: 'Le contenu ne peut pas être vide' })
  @MaxLength(5000, { message: 'Le contenu dépasse 5000 caractères' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content: string;

  @IsOptional()
  @IsUUID('4', { message: 'parentId doit être un UUID v4 valide' })
  parentId?: string;
}

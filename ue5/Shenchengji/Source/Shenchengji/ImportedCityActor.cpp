#include "ImportedCityActor.h"
#include "CityLoader.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Serialization/JsonSerializer.h"

AShenchengjiImportedCityActor::AShenchengjiImportedCityActor()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	// Static mesh components cannot attach to a movable root (2174 AttachTo warnings per launch).
	RootComponent->SetMobility(EComponentMobility::Static);
}

int32 AShenchengjiImportedCityActor::BuildFromLayout()
{
	FString Error;
	const FString Path = FShenchengjiCityLoader::ContentFile(TEXT("mesh-layout.json"));
	const TSharedPtr<FJsonObject> Root = FShenchengjiCityLoader::ReadJsonFile(Path, Error);
	if (!Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("城市网格清单未载入：%s"), *Error);
		return 0;
	}

	const TArray<TSharedPtr<FJsonValue>>* Groups = nullptr;
	if (!Root->TryGetArrayField(TEXT("groups"), Groups))
	{
		return 0;
	}

	TArray<FShenchengjiImportedMesh> Items;
	for (const TSharedPtr<FJsonValue>& GroupValue : *Groups)
	{
		const TSharedPtr<FJsonObject> Group = GroupValue->AsObject();
		if (!Group.IsValid())
		{
			continue;
		}
		const FString Destination = Group->GetStringField(TEXT("destination"));
		const TArray<TSharedPtr<FJsonValue>>* Meshes = nullptr;
		if (!Group->TryGetArrayField(TEXT("meshes"), Meshes))
		{
			continue;
		}
		for (const TSharedPtr<FJsonValue>& MeshValue : *Meshes)
		{
			const TSharedPtr<FJsonObject> Mesh = MeshValue->AsObject();
			if (!Mesh.IsValid())
			{
				continue;
			}
			FShenchengjiImportedMesh Item;
			Item.Destination = Destination;
			Item.Name = Mesh->GetStringField(TEXT("name"));
			Item.Scale = Mesh->GetNumberField(TEXT("s"));
			const TArray<TSharedPtr<FJsonValue>>* T = nullptr;
			if (Mesh->TryGetArrayField(TEXT("t"), T) && T->Num() >= 3)
			{
				Item.Translation = FVector((*T)[0]->AsNumber(), (*T)[1]->AsNumber(), (*T)[2]->AsNumber());
			}
			Items.Add(Item);
		}
	}

	SpawnedCount = 0;
	for (const FShenchengjiImportedMesh& Item : Items)
	{
		const FString AssetPath = FString::Printf(TEXT("%s/%s.%s"), *Item.Destination, *Item.Name, *Item.Name);
		UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
		if (!Mesh)
		{
			continue;
		}
		UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(this, *Item.Name);
		Component->SetStaticMesh(Mesh);
		Component->SetupAttachment(RootComponent);
		// Interchange already baked node T/S and Y-up metres → UE cm into the mesh.
		Component->SetRelativeTransform(FTransform::Identity);
		Component->SetMobility(EComponentMobility::Static);
		Component->SetAffectDistanceFieldLighting(false);
		if (Item.Destination.Contains(TEXT("Terrain")))
		{
			Component->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
			Component->SetCollisionResponseToAllChannels(ECR_Block);
		}
		else
		{
			// Visual only. Drive/walk collision stays on the city skeleton proxies.
			Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		}
		Component->RegisterComponent();
		++SpawnedCount;
	}

	UE_LOG(LogTemp, Display, TEXT("深城纪已放置导入网格 %d / %d"), SpawnedCount, Items.Num());
	return SpawnedCount;
}
